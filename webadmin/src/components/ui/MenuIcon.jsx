import * as Icons from 'lucide-react'
import { LayoutGrid } from 'lucide-react'

// Renders a lucide icon by its string name (as stored on menus/sections).
function MenuIcon({ name, size = 16, ...props }) {
  const Icon = Icons[name] || LayoutGrid
  return <Icon size={size} {...props} />
}

export default MenuIcon
