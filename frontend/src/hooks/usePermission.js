import { useCallback } from 'react'
import useAuthStore from '../store/authStore'

// permissions shape: [{ module, path, can_view, can_create, can_edit, can_delete }]
function usePermission() {
  const permissions = useAuthStore((s) => s.permissions)
  const roles = useAuthStore((s) => s.roles)
  const isSuperadmin = roles?.some((r) => r.is_superadmin)

  const check = useCallback(
    (moduleName, field) => {
      if (isSuperadmin) return true
      const perm = permissions?.find(
        (p) => p.module === moduleName || p.path === moduleName || p.menu === moduleName,
      )
      return !!perm?.[field]
    },
    [permissions, isSuperadmin],
  )

  return {
    canView: (moduleName) => check(moduleName, 'can_view'),
    canCreate: (moduleName) => check(moduleName, 'can_create'),
    canEdit: (moduleName) => check(moduleName, 'can_edit'),
    canDelete: (moduleName) => check(moduleName, 'can_delete'),
  }
}

export default usePermission
