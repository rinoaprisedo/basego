#!/usr/bin/env bash
# Reproducible load test against an ISOLATED compose project (never your dev stack).
#   backend/scripts/loadtest.sh up      build + start stack on :18800, migrate, seed data, create sessions
#   backend/scripts/loadtest.sh bench   run the benchmark suite (needs `hey`: go install github.com/rakyll/hey@latest)
#   backend/scripts/loadtest.sh down    remove the stack and its volumes
# Rate limits are raised for the test only (defaults would block the load).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH=/opt/homebrew/bin:$HOME/go/bin:$PATH
P=bgload; B=http://localhost:18800/api/v1; STATE=/tmp/bgload.state
OVR=/tmp/bgload.override.yml
dc() { docker compose -p $P -f "$ROOT/docker-compose.yml" -f $OVR "$@"; }
pg() { dc exec -T postgres psql -U postgres -d baseadmin -Atq "$@"; }

cat > $OVR <<'YML'
services:
  postgres:
    ports: !override ["127.0.0.1:15401:5432"]
  redis:
    ports: !override ["127.0.0.1:16301:6379"]
  backend:
    ports: !override ["18800:8800"]
    environment:
      APP_ENV: production
      RATE_LIMIT_API: 100000000
      RATE_LIMIT_LOGIN: 100000000
      RATE_LIMIT_LOGIN_ACCOUNT: 100000000
  webadmin:
    ports: !override ["18801:8080"]
YML

login() { # email password -> "session csrf"
  local jar; jar=$(mktemp); curl -s -c "$jar" $B/version >/dev/null
  local csrf; csrf=$(awk '$6=="csrf_token"{print $7}' "$jar")
  curl -s -c "$jar" -b "$jar" -H "X-CSRF-Token: $csrf" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" $B/auth/login -o /dev/null
  echo "$(awk '$6=="session"{print $7}' "$jar") $csrf"
}

case "${1:-}" in
up)
  dc up -d --build backend >/dev/null; sleep 6
  dc exec -T backend ./baseadmin migrate >/dev/null 2>&1
  PW=$(dc exec -T backend ./baseadmin seed 2>&1 | grep -o 'generated password: [^ ]*' | awk '{print $3}')
  [ -n "$PW" ] || PW=$(cat $STATE.pw)
  echo "$PW" > $STATE.pw
  read -r ADM ACSRF <<<"$(login admin@example.com "$PW")"
  api() { curl -s -b "session=$ADM; csrf_token=$ACSRF" -H "X-CSRF-Token: $ACSRF" -H 'Content-Type: application/json' "$@"; }
  api -d '{"name":"Staff"}' $B/roles >/dev/null
  RUUID=$(pg -c "select uuid from roles where name='Staff'"); MUUID=$(pg -c "select uuid from menus where path='users'")
  api -X PUT -d "{\"permissions\":[{\"menu_uuid\":\"$MUUID\",\"can_view\":true}]}" $B/roles/$RUUID/permissions >/dev/null
  api -d "{\"name\":\"Staff\",\"email\":\"staff@example.com\",\"password\":\"Passw0rd!x\",\"role_uuid\":\"$RUUID\"}" $B/users >/dev/null
  pg <<'SQL'
INSERT INTO users (uuid,name,email,password,status,created_at,updated_at)
SELECT gen_random_uuid(),'User '||g,'user'||g||'@load.test','$2a$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz012345','active',now()-(g||' minutes')::interval,now() FROM generate_series(1,20000) g ON CONFLICT DO NOTHING;
INSERT INTO activity_logs (uuid,user_id,action,module,ip_address,user_agent,created_at)
SELECT gen_random_uuid(),(1+g%20000),'update','users','10.0.'||(g%250)||'.'||(g%200),'ua',now()-(g||' seconds')::interval FROM generate_series(1,200000) g
WHERE (SELECT count(*) FROM activity_logs) < 100000;
ANALYZE;
SQL
  echo "stack up (admin pw saved in $STATE.pw)";;
bench)
  PW=$(cat $STATE.pw); DUR=${DUR:-10s}
  # fresh sessions every run (sessions are capped at 3/user, login tests evict them)
  read -r ADM ACSRF <<<"$(login admin@example.com "$PW")"
  read -r STF SCSRF <<<"$(login staff@example.com 'Passw0rd!x')"
  run() { local name=$1 url=$2 c=$3; shift 3
    hey -z "$DUR" -c "$c" "$@" "$url" 2>/dev/null | python3 -c "
import sys,re
t=sys.stdin.read(); g=lambda p:(re.search(p,t) or [0,'0'])[1]
codes=dict(re.findall(r'\[(\d+)\]\s+(\d+) responses',t)); ms=lambda s:'%.1fms'%(float(s)*1000)
print('%-34s c=%-4s rps=%-7.0f p50=%-9s p95=%-9s p99=%-9s %s'%('$name','$c',float(g(r'Requests/sec:\s+([\d.]+)')),ms(g(r'50%% in ([\d.]+)')),ms(g(r'95%% in ([\d.]+)')),ms(g(r'99%% in ([\d.]+)')),codes))"; }
  run "GET /version" $B/version 200
  run "GET /version" $B/version 1000
  run "GET /auth/me (admin)" $B/auth/me 200 -H "Cookie: session=$ADM"
  run "GET /users?limit=10 (staff)" "$B/users?limit=10" 50 -H "Cookie: session=$STF"
  run "GET /users?limit=10 (staff)" "$B/users?limit=10" 200 -H "Cookie: session=$STF"
  run "GET /users?limit=10 (staff)" "$B/users?limit=10" 1000 -H "Cookie: session=$STF"
  run "GET /users?search=user199" "$B/users?search=user199&limit=10" 100 -H "Cookie: session=$STF"
  run "GET /activity-logs?limit=10" "$B/activity-logs?limit=10" 100 -H "Cookie: session=$ADM"
  run "GET /activity-logs?user=user19" "$B/activity-logs?user=user19&limit=10" 20 -H "Cookie: session=$ADM"
  # write path: every PUT also queues an audit-log row (exercises batching)
  UU=$(pg -c "select uuid from users where email='staff@example.com'")
  A0=$(pg -c "select count(*) from activity_logs where module='users' and action='update'")
  run "PUT /users/:uuid (write + audit)" $B/users/$UU 50 -m PUT -H "Content-Type: application/json" -H "X-CSRF-Token: $ACSRF" -H "Cookie: session=$ADM; csrf_token=$ACSRF" -d '{"name":"Staff"}'
  sleep 3
  A1=$(pg -c "select count(*) from activity_logs where module='users' and action='update'")
  echo "    audit rows written during PUT run: $((A1-A0))  (compare with the 200-count above; backend drops: $(dc logs backend 2>&1 | grep -c 'queue full'))"
  run "POST /auth/login (alone)" $B/auth/login 20 -m POST -H "Content-Type: application/json" -H "X-CSRF-Token: $SCSRF" -H "Cookie: csrf_token=$SCSRF" -d '{"email":"nobody@load.test","password":"Wrong!Pass1"}'
  read -r ADM _ <<<"$(login admin@example.com "$PW")"
  (hey -z "$DUR" -c 30 -m POST -H "Content-Type: application/json" -H "X-CSRF-Token: $SCSRF" -H "Cookie: csrf_token=$SCSRF" -d '{"email":"nobody@load.test","password":"Wrong!Pass1"}' $B/auth/login >/dev/null 2>&1 &)
  sleep 2
  run "GET /auth/me DURING login flood" $B/auth/me 50 -H "Cookie: session=$ADM"; sleep 3;;
down)
  dc down -v --rmi local; rm -f $OVR $STATE.pw;;
*) echo "usage: $0 up|bench|down"; exit 1;;
esac
