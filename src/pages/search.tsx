import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { supabase } from '@/lib/supabase'
import { fullName } from '@/lib/utils'

export function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q')?.trim() ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search', q],
    enabled: q.length > 0,
    queryFn: async () => {
      const [employees, projects, documents] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, first_name, last_name, email, role, company_name')
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,company_name.ilike.%${q}%`)
          .limit(10),
        supabase.from('projects').select('id, name, location, status').ilike('name', `%${q}%`).limit(10),
        supabase.from('documents').select('id, name, category').ilike('name', `%${q}%`).limit(10),
      ])

      if (employees.error) throw employees.error
      if (projects.error) throw projects.error
      if (documents.error) throw documents.error

      return {
        employees: (employees.data ?? []) as Array<{
          id: string
          first_name: string
          last_name: string
          email: string
          role: string
          company_name: string | null
        }>,
        projects: (projects.data ?? []) as Array<{
          id: string
          name: string
          location: string | null
          status: string
        }>,
        documents: (documents.data ?? []) as Array<{
          id: string
          name: string
          category: string
        }>,
      }
    },
  })

  if (!q) return <EmptyState title="Search the system" description="Enter a query in the header search bar." />
  if (isLoading) return <LoadingState label={`Searching for “${q}”...`} />
  if (isError || !data) return <EmptyState title="Search failed" description="Try again in a moment." />

  const empty =
    data.employees.length === 0 && data.projects.length === 0 && data.documents.length === 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Search results</h1>
        <p className="text-sm text-muted-foreground">Results for “{q}”</p>
      </div>

      {empty ? (
        <EmptyState title="No matches" description="Try a different name, project, or document title." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <ResultCard title="People">
            {data.employees.map((person) => (
              <Link key={person.id} to={person.role === 'subcontractor' ? '/subcontractors' : '/employees'} className="block rounded-md border border-border px-3 py-2 hover:bg-muted/50">
                <p className="font-medium">{fullName(person.first_name, person.last_name)}</p>
                <p className="text-xs text-muted-foreground">{person.company_name || person.email}</p>
              </Link>
            ))}
          </ResultCard>
          <ResultCard title="Projects">
            {data.projects.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`} className="block rounded-md border border-border px-3 py-2 hover:bg-muted/50">
                <p className="font-medium">{project.name}</p>
                <p className="text-xs text-muted-foreground">{project.location || project.status}</p>
              </Link>
            ))}
          </ResultCard>
          <ResultCard title="Documents">
            {data.documents.map((doc) => (
              <Link key={doc.id} to="/documents" className="block rounded-md border border-border px-3 py-2 hover:bg-muted/50">
                <p className="font-medium">{doc.name}</p>
                <p className="text-xs text-muted-foreground">{doc.category}</p>
              </Link>
            ))}
          </ResultCard>
        </div>
      )}
    </div>
  )
}

function ResultCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  )
}
