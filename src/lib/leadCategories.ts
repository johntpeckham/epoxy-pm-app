// Sort helper for the Lead Category dropdown. Sorts alphabetically but pins
// any category literally named "Other" to the bottom so the catch-all bucket
// is always last in the list. Used by CreationFormModal and the four
// detail/list-page Edit Info modals so all five dropdowns render the same
// order without duplicated inline sort code.
export interface LeadCategoryLike {
  id: string
  name: string
}

export function sortCategoriesWithOtherLast<T extends LeadCategoryLike>(
  categories: readonly T[]
): T[] {
  return [...categories].sort((a, b) => {
    if (a.name === 'Other') return 1
    if (b.name === 'Other') return -1
    return a.name.localeCompare(b.name)
  })
}
