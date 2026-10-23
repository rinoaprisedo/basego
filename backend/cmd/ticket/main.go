// Command ticket lets a Claude Code session read QC tickets from the admin
// "Tiket" menu and report progress back, over the bearer-token /dev-api.
//
//	go run ./cmd/ticket list [-status todo,in_progress] [-platform Android] [-priority High] [-search text] [-all]
//	go run ./cmd/ticket show 12
//	go run ./cmd/ticket start 12 ["note"]
//	go run ./cmd/ticket done 12 "what changed + how to test"   (or "-" to read the note from stdin)
//	go run ./cmd/ticket ask 12 "question for QC"               (status need_info)
//	go run ./cmd/ticket comment 12 "text"
//
// Config: BASEGO_TICKET_API (e.g. http://localhost:8800/api/v1) and
// BASEGO_TICKET_TOKEN, or the same keys in a gitignored .ticket.env at the repo
// root. Tokens are created in admin Tiket → Akses Claude.
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type ticket struct {
	Number      uint64   `json:"number"`
	ReportedOn  string   `json:"reported_on"`
	Platform    string   `json:"platform"`
	Role        string   `json:"role"`
	Module      string   `json:"module"`
	Issue       string   `json:"issue"`
	Steps       string   `json:"steps"`
	Expected    string   `json:"expected"`
	Attachments []string `json:"attachments"`
	Priority    string   `json:"priority"`
	Category    string   `json:"category"`
	QCStatus    string   `json:"qc_status"`
	DevStatus   string   `json:"dev_status"`
	DevNote     string   `json:"dev_note"`
	DevBy       string   `json:"dev_by"`
	Reporter    string   `json:"reporter"`
}

type comment struct {
	Kind      string    `json:"kind"`
	Author    string    `json:"author"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

type envelope struct {
	Success bool            `json:"success"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
	Meta    *struct {
		Total int64 `json:"total"`
	} `json:"meta"`
}

var apiURL, token string

func main() {
	loadConfig()
	if len(os.Args) < 2 {
		usage()
	}
	cmd, args := os.Args[1], os.Args[2:]
	switch cmd {
	case "list", "ls":
		list(args)
	case "show", "get":
		show(number(args))
	case "start":
		setStatus(number(args), "in_progress", noteArg(args, false))
	case "done":
		setStatus(number(args), "done_by_claude", noteArg(args, true))
	case "ask", "info":
		setStatus(number(args), "need_info", noteArg(args, true))
	case "comment":
		n := number(args)
		var res json.RawMessage
		call("POST", fmt.Sprintf("/dev-api/tickets/%s/comments", n), map[string]string{"body": noteArg(args, true)}, &res)
		fmt.Printf("Komentar ditambahkan ke tiket #%s\n", n)
	default:
		usage()
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: ticket list|show|start|done|ask|comment … (see backend/cmd/ticket/main.go)")
	os.Exit(2)
}

func fail(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "ticket: "+format+"\n", args...)
	os.Exit(1)
}

func loadConfig() {
	apiURL, token = os.Getenv("BASEGO_TICKET_API"), os.Getenv("BASEGO_TICKET_TOKEN")
	if apiURL == "" || token == "" {
		if f := findUp(".ticket.env"); f != "" {
			data, _ := os.ReadFile(f)
			for _, line := range strings.Split(string(data), "\n") {
				k, v, ok := strings.Cut(strings.TrimSpace(line), "=")
				v = strings.Trim(strings.TrimSpace(v), `"'`)
				switch {
				case !ok:
				case k == "BASEGO_TICKET_API" && apiURL == "":
					apiURL = v
				case k == "BASEGO_TICKET_TOKEN" && token == "":
					token = v
				}
			}
		}
	}
	if apiURL == "" || token == "" {
		fail("set BASEGO_TICKET_API and BASEGO_TICKET_TOKEN (env or .ticket.env at the repo root); create a token in admin Tiket → Akses Claude")
	}
	apiURL = strings.TrimRight(apiURL, "/")
}

func findUp(name string) string {
	dir, _ := os.Getwd()
	for {
		p := filepath.Join(dir, name)
		if _, err := os.Stat(p); err == nil {
			return p
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

func number(args []string) string {
	if len(args) == 0 {
		fail("ticket number required")
	}
	n := strings.TrimPrefix(strings.TrimPrefix(strings.ToUpper(args[0]), "T-"), "#")
	return n
}

func noteArg(args []string, required bool) string {
	note := strings.Join(args[1:], " ")
	if note == "-" {
		b, _ := io.ReadAll(bufio.NewReader(os.Stdin))
		note = string(b)
	}
	if required && strings.TrimSpace(note) == "" {
		fail("note required (pass text, or - to read stdin)")
	}
	return note
}

func request(method, path string, body interface{}) *http.Response {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, apiURL+path, rd)
	if err != nil {
		fail("%v", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := (&http.Client{Timeout: 60 * time.Second}).Do(req)
	if err != nil {
		fail("%v", err)
	}
	return res
}

func call(method, path string, body interface{}, out interface{}) *envelope {
	res := request(method, path, body)
	defer res.Body.Close()
	var env envelope
	if err := json.NewDecoder(res.Body).Decode(&env); err != nil {
		fail("%s %s: HTTP %d (bukan JSON)", method, path, res.StatusCode)
	}
	if !env.Success {
		fail("%s %s: %s", method, path, env.Message)
	}
	if out != nil {
		if err := json.Unmarshal(env.Data, out); err != nil {
			fail("decode: %v", err)
		}
	}
	return &env
}

var statusLabels = map[string]string{
	"todo": "To Do", "in_progress": "In Progress", "need_info": "Butuh Info",
	"done_by_claude": "Done by Claude", "done": "Done", "wont_fix": "Won't Fix",
}

func list(args []string) {
	fs := flag.NewFlagSet("list", flag.ExitOnError)
	status := fs.String("status", "todo,in_progress", "comma-separated dev statuses")
	all := fs.Bool("all", false, "every status")
	platform := fs.String("platform", "", "Android|iOS|Website|Web Admin|Backend")
	priority := fs.String("priority", "", "Low|Medium|High|Critical")
	category := fs.String("category", "", "Bug|Request|Improvement")
	search := fs.String("search", "", "text")
	limit := fs.Int("limit", 50, "max rows")
	_ = fs.Parse(args)

	q := url.Values{"limit": {fmt.Sprint(*limit)}, "sort_by": {"priority"}, "sort_dir": {"desc"}}
	if !*all {
		q.Set("dev_status", *status)
	}
	for k, v := range map[string]string{"platform": *platform, "priority": *priority, "category": *category, "search": *search} {
		if v != "" {
			q.Set(k, v)
		}
	}
	var list []ticket
	env := call("GET", "/dev-api/tickets?"+q.Encode(), nil, &list)
	if len(list) == 0 {
		fmt.Println("Tidak ada tiket.")
		return
	}
	for _, t := range list {
		issue := strings.Join(strings.Fields(t.Issue), " ")
		if r := []rune(issue); len(r) > 110 {
			issue = string(r[:110]) + "…"
		}
		fmt.Printf("#%-4d %-8s %-11s %-9s %-14s [%s] %s — %s\n", t.Number, t.Priority, t.Category, t.Platform, statusLabels[t.DevStatus], t.QCStatus, t.Module, issue)
	}
	if env.Meta != nil && env.Meta.Total > int64(len(list)) {
		fmt.Printf("… %d dari %d tiket ditampilkan\n", len(list), env.Meta.Total)
	}
}

func show(n string) {
	var res struct {
		Ticket   ticket    `json:"ticket"`
		Comments []comment `json:"comments"`
	}
	call("GET", "/dev-api/tickets/"+n, nil, &res)
	t := res.Ticket
	fmt.Printf("# Tiket #%d — %s (%s)\n\n", t.Number, t.Module, t.Category)
	fmt.Printf("- Tanggal: %s\n- Platform: %s\n- Role: %s\n- Modul: %s\n- Priority: %s\n- Category: %s\n- QC status: %s\n- Status development: %s\n- Pelapor: %s\n\n",
		t.ReportedOn[:min(10, len(t.ReportedOn))], t.Platform, t.Role, t.Module, t.Priority, t.Category, t.QCStatus, statusLabels[t.DevStatus], t.Reporter)
	fmt.Printf("## Issue\n%s\n\n", t.Issue)
	if t.Steps != "" {
		fmt.Printf("## Langkah reproduksi\n%s\n\n", t.Steps)
	}
	if t.Expected != "" {
		fmt.Printf("## Hasil yang diharapkan\n%s\n\n", t.Expected)
	}
	if len(t.Attachments) > 0 {
		dir := filepath.Join(os.TempDir(), "basego-tickets", fmt.Sprint(t.Number))
		_ = os.MkdirAll(dir, 0o755)
		fmt.Println("## Lampiran (sudah diunduh — baca dengan Read tool)")
		for i, p := range t.Attachments {
			dst := filepath.Join(dir, fmt.Sprintf("%d%s", i+1, filepath.Ext(p)))
			if err := download(fmt.Sprintf("/dev-api/tickets/%d/attachments/%d", t.Number, i), dst); err != nil {
				fmt.Printf("- gagal mengunduh %s: %v\n", p, err)
				continue
			}
			fmt.Printf("- %s\n", dst)
		}
		fmt.Println()
	}
	if t.DevNote != "" {
		fmt.Printf("## Catatan development terakhir (%s)\n%s\n\n", t.DevBy, t.DevNote)
	}
	if len(res.Comments) > 0 {
		fmt.Println("## Timeline")
		for _, c := range res.Comments {
			fmt.Printf("- %s · %s: %s\n", c.CreatedAt.Local().Format("02/01/2006 15:04"), c.Author, strings.ReplaceAll(c.Body, "\n", "\n  "))
		}
	}
}

func download(path, dst string) error {
	res := request("GET", path, nil)
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return fmt.Errorf("HTTP %d", res.StatusCode)
	}
	if filepath.Ext(dst) == "" {
		if exts, _ := mime.ExtensionsByType(res.Header.Get("Content-Type")); len(exts) > 0 {
			dst += exts[0]
		}
	}
	f, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, res.Body)
	return err
}

func setStatus(n, status, note string) {
	var t ticket
	call("POST", fmt.Sprintf("/dev-api/tickets/%s/status", n), map[string]string{"status": status, "note": note}, &t)
	fmt.Printf("Tiket #%d → %s\n", t.Number, statusLabels[t.DevStatus])
}
