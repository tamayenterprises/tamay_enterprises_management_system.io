import { Button } from '@/components/ui/button'
import { PERSON_DIRECTORY_FILTERS, type PersonDirectoryFilter } from '@/lib/person-directory'

export function PersonDirectoryFilters({
  value,
  onChange,
}: {
  value: PersonDirectoryFilter
  onChange: (value: PersonDirectoryFilter) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERSON_DIRECTORY_FILTERS.map((filter) => (
        <Button
          key={filter.value}
          size="sm"
          variant={value === filter.value ? 'default' : 'outline'}
          onClick={() => onChange(filter.value)}
        >
          {filter.label}
        </Button>
      ))}
    </div>
  )
}
