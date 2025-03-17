# Google Calendar AutoAuth MCP Server

A Model Context Protocol (MCP) server for Google Calendar integration in Claude Desktop with auto authentication support. This server enables AI assistants to manage Google Calendar through natural language interactions.

![](https://badge.mcpx.dev?type=server 'MCP Server')

## Features

- Create calendar events with title, description, location, and attendees
- Update existing calendar events 
- Delete calendar events
- Retrieve event details
- List events within a specified time range
- Search for events by keyword
- List all available calendars
- Support for natural language date/time input (e.g., "tomorrow at 2pm", "next monday")
- Full integration with Google Calendar API
- Simple OAuth2 authentication flow with auto browser launch
- Support for both Desktop and Web application credentials
- Global credential storage for convenience

## Installation & Authentication

### Installing Manually
1. Create a Google Cloud Project and obtain credentials:

   a. Create a Google Cloud Project:
      - Go to [Google Cloud Console](https://console.cloud.google.com/)
      - Create a new project or select an existing one
      - Enable the Google Calendar API for your project

   b. Create OAuth 2.0 Credentials:
      - Go to "APIs & Services" > "Credentials"
      - Click "Create Credentials" > "OAuth client ID"
      - Choose either "Desktop app" or "Web application" as application type
      - Give it a name and click "Create"
      - For Web application, add `http://localhost:3000/oauth2callback` to the authorized redirect URIs
      - Download the JSON file of your client's OAuth keys
      - Rename the key file to `gcp-oauth.keys.json`

2. Run Authentication:

   You can authenticate in two ways:

   a. Global Authentication (Recommended):
   ```bash
   # First time: Place gcp-oauth.keys.json in your home directory's .calendar-mcp folder
   mkdir -p ~/.calendar-mcp
   mv gcp-oauth.keys.json ~/.calendar-mcp/

   # Run authentication from anywhere
   npx @nchufa/calendar auth
   ```

   b. Local Authentication:
   ```bash
   # Place gcp-oauth.keys.json in your current directory
   # The file will be automatically copied to global config
   npx @nchufa/calendar auth
   ```

   The authentication process will:
   - Look for `gcp-oauth.keys.json` in the current directory or `~/.calendar-mcp/`
   - If found in current directory, copy it to `~/.calendar-mcp/`
   - Open your default browser for Google authentication
   - Save credentials as `~/.calendar-mcp/credentials.json`

   > **Note**: 
   > - After successful authentication, credentials are stored globally in `~/.calendar-mcp/` and can be used from any directory
   > - Both Desktop app and Web application credentials are supported
   > - For Web application credentials, make sure to add `http://localhost:3000/oauth2callback` to your authorized redirect URIs

3. Configure in Claude Desktop:

Add the following to your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "calendar": {
      "command": "npx",
      "args": [
        "@nchufa/calendar"
      ]
    }
  }
}
```

## Available Tools

The server provides the following tools that can be used through Claude Desktop:

### 1. Create Event (`create_event`)
Creates a new calendar event.

```json
{
  "summary": "Team Meeting",
  "description": "Weekly team sync to discuss project progress",
  "location": "Conference Room A",
  "start": "2025-04-01T14:00:00",
  "end": "2025-04-01T15:00:00",
  "attendees": ["colleague@example.com", "manager@example.com"],
  "reminders": {
    "useDefault": false,
    "overrides": [
      {
        "method": "email",
        "minutes": 30
      },
      {
        "method": "popup",
        "minutes": 10
      }
    ]
  }
}
```

Natural language date/time is also supported:

```json
{
  "summary": "Coffee with John",
  "location": "Starbucks Downtown",
  "start": "tomorrow at 2:30pm",
  "end": "tomorrow at 3:30pm"
}
```

### 2. Get Event (`get_event`)
Retrieves details of a specific calendar event.

```json
{
  "eventId": "abc123xyz456",
  "calendarId": "primary"
}
```

### 3. Update Event (`update_event`)
Updates an existing calendar event.

```json
{
  "eventId": "abc123xyz456",
  "summary": "Updated Meeting Title",
  "location": "New Location",
  "start": "2025-04-01T15:00:00",
  "end": "2025-04-01T16:00:00"
}
```

### 4. Delete Event (`delete_event`)
Deletes a calendar event.

```json
{
  "eventId": "abc123xyz456",
  "calendarId": "primary"
}
```

### 5. List Events (`list_events`)
Lists calendar events within a specified time range.

```json
{
  "calendarId": "primary",
  "timeMin": "2025-04-01T00:00:00",
  "timeMax": "2025-04-07T23:59:59",
  "maxResults": 10,
  "orderBy": "startTime"
}
```

### 6. Search Events (`search_events`)
Searches for events matching a query.

```json
{
  "query": "meeting",
  "calendarId": "primary",
  "timeMin": "2025-04-01T00:00:00",
  "maxResults": 5
}
```

### 7. List Calendars (`list_calendars`)
Lists all available calendars.

```json
{}
```

## Natural Language Date/Time Support

The server supports various natural language formats for dates and times:

- Specific dates: "2025-04-01T14:00:00" (ISO format)
- Simple references: "today", "tomorrow", "now"
- Relative times: "2 hours later", "3 days later" 
- Day references: "next monday", "next tuesday"
- Combined formats: "tomorrow at 2pm", "monday at 15:30"

This makes it easy to create and update events using natural language instructions.

## Security Notes

- OAuth credentials are stored securely in your local environment (`~/.calendar-mcp/`)
- The server uses offline access to maintain persistent authentication
- Never share or commit your credentials to version control
- Regularly review and revoke unused access in your Google Account settings

## Troubleshooting

1. **OAuth Keys Not Found**
   - Make sure `gcp-oauth.keys.json` is in either your current directory or `~/.calendar-mcp/`
   - Check file permissions

2. **Invalid Credentials Format**
   - Ensure your OAuth keys file contains either `web` or `installed` credentials
   - For web applications, verify the redirect URI is correctly configured

3. **Port Already in Use**
   - If port 3000 is already in use, please free it up before running authentication
   - You can find and stop the process using that port

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

Special thanks to [GongRzhe](https://github.com/GongRzhe) and his [Calendar-Autoauth-MCP-Server](https://github.com/GongRzhe/Calendar-Autoauth-MCP-Server) project which served as a foundation for this implementation.

## Support

If you encounter any issues or have questions, please file an issue on the GitHub repository.
