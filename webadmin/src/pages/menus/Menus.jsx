import MenuList from './MenuList'

// Menus and their sections are managed together on one page: sections are
// cards (drag to reorder), menus are rows inside them. One sidebar entry and
// one permission ("menus") cover everything.
function Menus() {
  return (
    <div className="w-full md:w-3/5 xl:w-2/5">
      <MenuList />
    </div>
  )
}

export default Menus
