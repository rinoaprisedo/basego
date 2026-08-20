<?php

namespace Database\Seeders;

use App\Models\Menu;
use App\Models\MenuSection;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database. Mirrors backend-go/database/seeders/seed.go exactly,
     * idempotent via firstOrCreate throughout.
     */
    public function run(): void
    {
        $superadminRole = $this->seedSuperadminRole();
        $this->seedUsers($superadminRole);
        $menus = $this->seedMenus();
        $this->seedPermissions($superadminRole, $menus);
        $this->seedSettings();

        $this->call(MenuStructureSeeder::class);
    }

    private function seedSuperadminRole(): Role
    {
        return Role::firstOrCreate(
            ['name' => 'Superadmin'],
            [
                'description' => 'Full system access. Cannot be deleted or demoted.',
                'is_superadmin' => true,
            ]
        );
    }

    private function seedUsers(Role $superadminRole): void
    {
        User::firstOrCreate(
            ['email' => 'admin@example.com'],
            [
                'name' => 'Super Admin',
                'password' => Hash::make('Admin@12345'),
                'status' => 'active',
                'role_id' => $superadminRole->id,
            ]
        );

        User::firstOrCreate(
            ['email' => 'rinoaprisedo@gmail.com'],
            [
                'name' => 'Rino Aprisedo',
                'password' => Hash::make('password!!'),
                'status' => 'active',
                'role_id' => $superadminRole->id,
            ]
        );
    }

    /**
     * @return array<string, Menu> menus keyed by path
     */
    private function seedMenus(): array
    {
        $sections = [
            ['name' => 'Dashboard', 'icon' => 'LayoutDashboard', 'order' => 1, 'menus' => [
                ['name' => 'Dashboard', 'icon' => 'LayoutDashboard', 'path' => '/', 'order' => 1],
            ]],
            ['name' => 'User Management', 'icon' => 'Users', 'order' => 2, 'menus' => [
                ['name' => 'Users', 'icon' => 'User', 'path' => 'users', 'order' => 1],
                ['name' => 'Roles', 'icon' => 'Shield', 'path' => 'roles', 'order' => 2],
            ]],
            ['name' => 'System', 'icon' => 'Settings', 'order' => 3, 'menus' => [
                ['name' => 'Menus', 'icon' => 'Menu', 'path' => 'menus', 'order' => 1],
                ['name' => 'Menu Sections', 'icon' => 'FolderTree', 'path' => 'menu-sections', 'order' => 2],
                ['name' => 'Settings', 'icon' => 'Settings', 'path' => 'settings', 'order' => 3],
                ['name' => 'Activity Logs', 'icon' => 'History', 'path' => 'activity-logs', 'order' => 4],
            ]],
        ];

        $menusByPath = [];

        foreach ($sections as $sectionData) {
            $section = MenuSection::firstOrCreate(
                ['name' => $sectionData['name']],
                ['icon' => $sectionData['icon'], 'order' => $sectionData['order']]
            );

            foreach ($sectionData['menus'] as $menuData) {
                $menu = Menu::firstOrCreate(
                    ['path' => $menuData['path']],
                    [
                        'menu_section_id' => $section->id,
                        'name' => $menuData['name'],
                        'icon' => $menuData['icon'],
                        'order' => $menuData['order'],
                        'is_active' => true,
                    ]
                );
                $menusByPath[$menuData['path']] = $menu;
            }
        }

        return $menusByPath;
    }

    /**
     * @param array<string, Menu> $menus
     */
    private function seedPermissions(Role $superadminRole, array $menus): void
    {
        foreach ($menus as $menu) {
            Permission::firstOrCreate(
                ['role_id' => $superadminRole->id, 'menu_id' => $menu->id],
                [
                    'can_view' => true,
                    'can_create' => true,
                    'can_edit' => true,
                    'can_delete' => true,
                ]
            );
        }
    }

    private function seedSettings(): void
    {
        $settings = [
            ['key' => 'app_name', 'type' => 'string', 'value' => 'BaseAdmin'],
            ['key' => 'app_logo', 'type' => 'file', 'value' => ''],
            ['key' => 'app_favicon', 'type' => 'file', 'value' => ''],
            ['key' => 'maintenance_mode', 'type' => 'boolean', 'value' => 'false'],
        ];

        foreach ($settings as $setting) {
            Setting::firstOrCreate(
                ['key' => $setting['key']],
                ['type' => $setting['type'], 'value' => $setting['value']]
            );
        }
    }
}
