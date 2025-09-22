name: Feature
description: Request a new feature for Autodun EV Finder
labels: ["feature"]
body:
  - type: textarea
    id: context
    attributes:
      label: What / Why
      description: Describe the problem, the users affected, and the desired outcome.
    validations:
      required: true
  - type: textarea
    id: acceptance
    attributes:
      label: Acceptance criteria
      description: List clear, testable criteria (what should be true when done).
      placeholder: |
        - Heatmap toggles with no console errors
        - Searching "EC1A" pans/zooms and loads stations
        - Feedback form opens and submits successfully
    validations:
      required: true
  - type: textarea
    id: notes-for-copilot
    attributes:
      label: Notes for Copilot
      description: Tech stack / constraints for Copilot.
      placeholder: |
        - Next.js 14 App Router, TypeScript
        - Leaflet 1.9 + react-leaflet 4 (client-only)
        - Heatmap: leaflet.heat
        - Stations from /api/stations (bbox or lat/lon+dist), cache: 'no-store'
        - Use AbortController to prevent racing fetches
