import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canUseNearbyFinder } from '@/features/nearby/nearby-access'
import { canonicalProjectAddress } from '@/features/schedule/schedule-links'
import type { Project, UserRole } from '@/types/database'

type LocatedProject = Pick<Project, 'id' | 'archived_at' | 'job_site_address' | 'location' | 'latitude' | 'longitude'>

/** Project Detail → Nearby Finder centred on this job site. Staff only; needs a job-site location. */
export function FindNearbyLink({ project, role }: { project: LocatedProject; role?: UserRole | null }) {
  const hasLocation =
    Boolean(canonicalProjectAddress(project)) || (project.latitude != null && project.longitude != null)
  if (!canUseNearbyFinder(role) || project.archived_at || !hasLocation) return null
  return (
    <Button asChild size="sm" variant="outline" className="min-h-11 w-full sm:w-auto">
      <Link to={`/nearby?project=${encodeURIComponent(project.id)}`}>
        <MapPin className="h-4 w-4" aria-hidden />
        Find Nearby
      </Link>
    </Button>
  )
}
