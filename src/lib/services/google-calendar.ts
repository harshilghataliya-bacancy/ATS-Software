import { google } from 'googleapis'
import { createOAuth2Client } from './gmail'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendarEventParams {
  summary: string
  description?: string
  startDateTime: string // ISO 8601
  durationMinutes: number
  attendees: string[] // email addresses
  location?: string // physical location for face-to-face
  includeMeetLink?: boolean // default true — set false for onsite interviews
}

interface CalendarEventResult {
  eventId: string
  meetLink: string | null
  htmlLink: string | null
}

// ---------------------------------------------------------------------------
// Create Calendar Event with Google Meet
// ---------------------------------------------------------------------------

export async function createCalendarEvent(
  accessToken: string,
  params: CalendarEventParams
): Promise<CalendarEventResult> {
  const client = createOAuth2Client()
  client.setCredentials({ access_token: accessToken })

  const calendar = google.calendar({ version: 'v3', auth: client })

  const startDate = new Date(params.startDateTime)
  const endDate = new Date(startDate.getTime() + params.durationMinutes * 60_000)

  const withMeet = params.includeMeetLink !== false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestBody: any = {
    summary: params.summary,
    description: params.description,
    start: { dateTime: startDate.toISOString() },
    end: { dateTime: endDate.toISOString() },
    attendees: params.attendees.map((email) => ({ email })),
  }

  if (params.location) {
    requestBody.location = params.location
  }

  if (withMeet) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: `hireflow-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    }
  }

  const event = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: withMeet ? 1 : 0,
    sendUpdates: 'all',
    requestBody,
  })

  return {
    eventId: event.data.id ?? '',
    meetLink: event.data.hangoutLink ?? null,
    htmlLink: event.data.htmlLink ?? null,
  }
}
