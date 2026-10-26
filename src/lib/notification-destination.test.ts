import { describe, expect, it } from 'vitest'
import { notificationDestination, notificationVisibleToRole } from './notification-destination'

describe('notificationDestination', () => {
  it('points company update notifications at the specific post', () => {
    expect(
      notificationDestination({
        destination_route: '/updates',
        entity_type: 'company_update',
        entity_id: 'u1',
        activity_type: 'COMPANY_UPDATE_CREATED',
      }),
    ).toBe('/updates?tab=company&update=u1')
  })

  it('points company replies at the reply inside the root update', () => {
    expect(
      notificationDestination({
        destination_route: '/updates?tab=company',
        entity_type: 'company_update',
        entity_id: 'reply-1',
        parent_entity_id: 'root-1',
        activity_type: 'COMPANY_UPDATE_REPLIED',
      }),
    ).toBe('/updates?tab=company&update=root-1&reply=reply-1')
  })

  it('points project update notifications at the note, including portal mapping', () => {
    expect(
      notificationDestination({
        destination_route: '/projects/p1',
        entity_type: 'project_note',
        entity_id: 'note-9',
        project_id: 'p1',
        activity_type: 'COMMENT_CREATED',
      }),
    ).toBe('/projects/p1?update=note-9')

    expect(
      notificationDestination(
        {
          destination_route: '/projects/p1',
          entity_type: 'project_note',
          entity_id: 'note-9',
          project_id: 'p1',
        },
        { client: true },
      ),
    ).toBe('/portal/projects/p1?update=note-9')
  })

  it('points document notifications at the file on the project', () => {
    expect(
      notificationDestination({
        link: '/projects/p1',
        entity_type: 'document',
        entity_id: 'doc-4',
        project_id: 'p1',
        activity_type: 'FILE_UPLOADED',
      }),
    ).toBe('/projects/p1?tab=files&doc=doc-4')
  })
})

describe('notificationVisibleToRole', () => {
  const exception = {
    activity_type: 'ATTENDANCE_EXCEPTION_SUBMITTED',
    entity_type: 'attendance_exception',
    relevance: 'requires_attention',
    destination_route: '/timesheets?exception=x',
  }

  it('hides other workers clock-in exceptions from employees and subcontractors', () => {
    expect(notificationVisibleToRole(exception, 'employee')).toBe(false)
    expect(notificationVisibleToRole(exception, 'subcontractor')).toBe(false)
    expect(notificationVisibleToRole(exception, 'client')).toBe(false)
  })

  it('keeps exceptions for management and keeps a worker mentioned about their own outcome', () => {
    expect(notificationVisibleToRole(exception, 'admin')).toBe(true)
    expect(notificationVisibleToRole(exception, 'project_manager')).toBe(true)
    expect(
      notificationVisibleToRole(
        { ...exception, activity_type: 'ATTENTION_REVIEWED', relevance: 'mentioned' },
        'employee',
      ),
    ).toBe(true)
  })

  it('still shows assigned-project conversation to the crew', () => {
    expect(
      notificationVisibleToRole(
        { activity_type: 'COMMENT_CREATED', entity_type: 'project_note', relevance: 'assigned_project' },
        'employee',
      ),
    ).toBe(true)
  })
})
