import { describe, expect, it } from 'vitest'
import { splitWorkerAssignments } from './project-people'

describe('splitWorkerAssignments', () => {
  it('puts project managers first and everyone else behind See more', () => {
    const rows = [
      { id: '1', profile: { role: 'employee' } },
      { id: '2', profile: { role: 'project_manager' } },
      { id: '3', profile: { role: 'subcontractor' } },
    ]
    const { managers, others } = splitWorkerAssignments(rows)
    expect(managers.map((row) => row.id)).toEqual(['2'])
    expect(others.map((row) => row.id)).toEqual(['1', '3'])
  })

  it('keeps every assigned project manager visible', () => {
    const rows = [
      { id: 'a', profile: { role: 'project_manager' } },
      { id: 'b', profile: { role: 'project_manager' } },
    ]
    expect(splitWorkerAssignments(rows).others).toEqual([])
    expect(splitWorkerAssignments(rows).managers).toHaveLength(2)
  })
})
