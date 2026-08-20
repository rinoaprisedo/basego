<?php

namespace Database\Seeders;

use App\Models\Menu;
use App\Models\MenuSection;
use Illuminate\Database\Seeder;

/**
 * Seeds a nested menu tree (sections -> items -> sub-items -> sub-sub-items)
 * for the actual product this admin panel manages — separate from the
 * boilerplate's own Dashboard/User Management/System admin-panel menus,
 * which are left untouched. Every leaf/branch is created with an empty
 * `path` for now (wired up later once the real routes exist) and matched
 * idempotently by (name, section, parent) rather than `path`, since many
 * rows share the same blank path.
 */
class MenuStructureSeeder extends Seeder
{
    public function run(): void
    {
        $this->removeSection('Management');

        $sections = [
            'Home' => [
                'icon' => 'Home',
                'items' => [
                    'Carousel' => ['icon' => 'GalleryHorizontal'],
                ],
            ],
            'Company' => [
                'icon' => 'Building2',
                'items' => [
                    'COBCE Guidelines' => [
                        'icon' => 'BookOpen',
                        'children' => [
                            'Manage Content' => ['icon' => 'FileEdit'],
                        ],
                    ],
                    'Internal Memos and Work Guides' => [
                        'icon' => 'FileText',
                        'children' => [
                            'Category' => ['icon' => 'Tag'],
                            'Manage Content' => ['icon' => 'FileEdit'],
                        ],
                    ],
                    'Job Posting' => [
                        'icon' => 'Briefcase',
                        'children' => [
                            'Employment Type' => ['icon' => 'ListChecks'],
                            'Manage Vacancy' => [
                                'icon' => 'ClipboardList',
                                'children' => [
                                    'View Applicants' => ['icon' => 'UserCheck'],
                                ],
                            ],
                            'Report' => ['icon' => 'FileBarChart'],
                        ],
                    ],
                    'Talk with Ombuds' => [
                        'icon' => 'MessageCircle',
                        'children' => [
                            'Category' => ['icon' => 'Tag'],
                            'Manage Report' => ['icon' => 'FileText'],
                            'Ombuds Person' => ['icon' => 'UserCog'],
                        ],
                    ],
                ],
            ],
            'Learning' => [
                'icon' => 'GraduationCap',
                'items' => [
                    'E-Learning Modules' => [
                        'icon' => 'Laptop',
                        'children' => [
                            'Category' => ['icon' => 'Tag'],
                            'Manage Content' => ['icon' => 'FileEdit'],
                            'Manage Content Details' => ['icon' => 'FileText'],
                            'Manage Quiz' => ['icon' => 'HelpCircle'],
                            'Report' => ['icon' => 'FileBarChart'],
                        ],
                    ],
                    'Induction Kits' => [
                        'icon' => 'PackageOpen',
                        'children' => [
                            'Category' => ['icon' => 'Tag'],
                            'Learning Content' => ['icon' => 'BookOpen'],
                            'Manage Quiz' => ['icon' => 'HelpCircle'],
                            'Resource Library' => ['icon' => 'Library'],
                            'Report' => ['icon' => 'FileBarChart'],
                        ],
                    ],
                ],
            ],
            'Engagement' => [
                'icon' => 'Handshake',
                'items' => [
                    'Appreciate Your Office Hero' => [
                        'icon' => 'Award',
                        'children' => [
                            'Manage Appreciation' => ['icon' => 'Gift'],
                        ],
                    ],
                    'Discussion' => [
                        'icon' => 'MessageSquare',
                        'children' => [
                            'Category' => ['icon' => 'Tag'],
                            'Goal' => ['icon' => 'Target'],
                            'Manage Discussion' => ['icon' => 'MessagesSquare'],
                            'Approval' => ['icon' => 'CheckCircle'],
                        ],
                    ],
                    'Inner Circle' => [
                        'icon' => 'Users2',
                        'children' => [
                            'Manage Content' => ['icon' => 'FileEdit'],
                        ],
                    ],
                    'Suggestion' => [
                        'icon' => 'Lightbulb',
                        'children' => [
                            'Category' => ['icon' => 'Tag'],
                            'Manage Suggestion' => ['icon' => 'FileEdit'],
                        ],
                    ],
                ],
            ],
        ];

        $sectionOrder = (int) MenuSection::max('order');

        foreach ($sections as $sectionName => $sectionData) {
            $sectionOrder++;
            $section = MenuSection::updateOrCreate(
                ['name' => $sectionName],
                ['icon' => $sectionData['icon'], 'order' => $sectionOrder]
            );

            $this->seedItems($sectionData['items'], $section->id, null);
        }
    }

    private function seedItems(array $items, int $sectionId, ?int $parentId): void
    {
        $order = 0;
        foreach ($items as $name => $node) {
            $order++;
            $menu = Menu::updateOrCreate(
                ['name' => $name, 'menu_section_id' => $sectionId, 'parent_id' => $parentId],
                ['icon' => $node['icon'] ?? '', 'path' => '', 'order' => $order, 'is_active' => true]
            );

            if (! empty($node['children'])) {
                $this->seedItems($node['children'], $sectionId, $menu->id);
            }
        }
    }

    private function removeSection(string $name): void
    {
        $section = MenuSection::where('name', $name)->first();
        if (! $section) {
            return;
        }
        Menu::where('menu_section_id', $section->id)->get()->each(fn (Menu $menu) => $menu->forceDelete());
        $section->forceDelete();
    }
}
