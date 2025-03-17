#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from 'googleapis';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import open from 'open';
import os from 'os';
import { formatDateTime, parseDateTime } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration paths
const CONFIG_DIR = path.join(os.homedir(), '.calendar-mcp');
const OAUTH_PATH = process.env.CALENDAR_OAUTH_PATH || path.join(CONFIG_DIR, 'gcp-oauth.keys.json');
const CREDENTIALS_PATH = process.env.CALENDAR_CREDENTIALS_PATH || path.join(CONFIG_DIR, 'credentials.json');

// Define time zone for calendar operations
const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// OAuth2 configuration
let oauth2Client: OAuth2Client;

async function loadCredentials() {
    try {
        // Create config directory if it doesn't exist
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }

        // Check for OAuth keys in current directory first, then in config directory
        const localOAuthPath = path.join(process.cwd(), 'gcp-oauth.keys.json');
        let oauthPath = OAUTH_PATH;

        if (fs.existsSync(localOAuthPath)) {
            // If found in current directory, copy to config directory
            fs.copyFileSync(localOAuthPath, OAUTH_PATH);
            console.log('OAuth keys found in current directory, copied to global config.');
        }

        if (!fs.existsSync(OAUTH_PATH)) {
            console.error('Error: OAuth keys file not found. Please place gcp-oauth.keys.json in current directory or', CONFIG_DIR);
            process.exit(1);
        }

        const keysContent = JSON.parse(fs.readFileSync(OAUTH_PATH, 'utf8'));
        const keys = keysContent.installed || keysContent.web;

        if (!keys) {
            console.error('Error: Invalid OAuth keys file format. File should contain either "installed" or "web" credentials.');
            process.exit(1);
        }

        oauth2Client = new OAuth2Client(
            keys.client_id,
            keys.client_secret,
            'http://localhost:3000/oauth2callback'
        );

        if (fs.existsSync(CREDENTIALS_PATH)) {
            const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
            oauth2Client.setCredentials(credentials);
        }
    } catch (error) {
        console.error('Error loading credentials:', error);
        process.exit(1);
    }
}

async function authenticate() {
    const server = http.createServer();
    server.listen(3000);

    return new Promise<void>((resolve, reject) => {
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/calendar'],
        });

        console.log('Please visit this URL to authenticate:', authUrl);
        open(authUrl);

        server.on('request', async (req, res) => {
            if (!req.url?.startsWith('/oauth2callback')) return;

            const url = new URL(req.url, 'http://localhost:3000');
            const code = url.searchParams.get('code');

            if (!code) {
                res.writeHead(400);
                res.end('No code provided');
                reject(new Error('No code provided'));
                return;
            }

            try {
                const { tokens } = await oauth2Client.getToken(code);
                oauth2Client.setCredentials(tokens);
                fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(tokens));

                res.writeHead(200);
                res.end('Authentication successful! You can close this window.');
                server.close();
                resolve();
            } catch (error) {
                res.writeHead(500);
                res.end('Authentication failed');
                reject(error);
            }
        });
    });
}

// Schema definitions for Google Calendar operations
const CreateEventSchema = z.object({
    summary: z.string().describe("Event title/summary"),
    description: z.string().optional().describe("Event description or details"),
    location: z.string().optional().describe("Event location"),
    start: z.string().describe("Start time in ISO format (YYYY-MM-DDTHH:MM:SS) or natural language like 'tomorrow at 2pm'"),
    end: z.string().describe("End time in ISO format (YYYY-MM-DDTHH:MM:SS) or natural language like '3 hours later'"),
    attendees: z.array(z.string()).optional().describe("List of attendee email addresses"),
    calendarId: z.string().optional().default("primary").describe("Calendar ID (default: primary)"),
    reminders: z.object({
        useDefault: z.boolean().optional(),
        overrides: z.array(z.object({
            method: z.enum(["email", "popup"]),
            minutes: z.number()
        })).optional()
    }).optional().describe("Reminder settings for the event")
});

const GetEventSchema = z.object({
    eventId: z.string().describe("ID of the event to retrieve"),
    calendarId: z.string().optional().default("primary").describe("Calendar ID (default: primary)")
});

const UpdateEventSchema = z.object({
    eventId: z.string().describe("ID of the event to update"),
    calendarId: z.string().optional().default("primary").describe("Calendar ID (default: primary)"),
    summary: z.string().optional().describe("Updated event title/summary"),
    description: z.string().optional().describe("Updated event description"),
    location: z.string().optional().describe("Updated event location"),
    start: z.string().optional().describe("Updated start time (ISO format or natural language)"),
    end: z.string().optional().describe("Updated end time (ISO format or natural language)"),
    attendees: z.array(z.string()).optional().describe("Updated list of attendee email addresses")
});

const DeleteEventSchema = z.object({
    eventId: z.string().describe("ID of the event to delete"),
    calendarId: z.string().optional().default("primary").describe("Calendar ID (default: primary)")
});

const ListEventsSchema = z.object({
    calendarId: z.string().optional().default("primary").describe("Calendar ID (default: primary)"),
    timeMin: z.string().optional().describe("Start time in ISO format or natural language (default: now)"),
    timeMax: z.string().optional().describe("End time in ISO format or natural language"),
    maxResults: z.number().optional().default(10).describe("Maximum number of events to return (default: 10)"),
    orderBy: z.enum(["startTime", "updated"]).optional().default("startTime").describe("Sort order (default: startTime)")
});

const SearchEventsSchema = z.object({
    query: z.string().describe("Search query (e.g., 'meeting', 'john')"),
    calendarId: z.string().optional().default("primary").describe("Calendar ID (default: primary)"),
    timeMin: z.string().optional().describe("Start time in ISO format or natural language (default: now)"),
    timeMax: z.string().optional().describe("End time in ISO format or natural language"),
    maxResults: z.number().optional().default(10).describe("Maximum number of events to return (default: 10)")
});

const ListCalendarsSchema = z.object({});

// Main function
async function main() {
    await loadCredentials();

    if (process.argv[2] === 'auth') {
        await authenticate();
        console.log('Authentication completed successfully');
        process.exit(0);
    }

    // Initialize Calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Server implementation
    const server = new Server({
        name: "calendar",
        version: "1.0.0",
        capabilities: {
            tools: {},
        },
    });

    // Tool handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            {
                name: "create_event",
                description: "Creates a new event in Google Calendar",
                inputSchema: zodToJsonSchema(CreateEventSchema),
            },
            {
                name: "get_event",
                description: "Retrieves details of a specific calendar event",
                inputSchema: zodToJsonSchema(GetEventSchema),
            },
            {
                name: "update_event",
                description: "Updates an existing calendar event",
                inputSchema: zodToJsonSchema(UpdateEventSchema),
            },
            {
                name: "delete_event",
                description: "Deletes a calendar event",
                inputSchema: zodToJsonSchema(DeleteEventSchema),
            },
            {
                name: "list_events",
                description: "Lists calendar events within specified time range",
                inputSchema: zodToJsonSchema(ListEventsSchema),
            },
            {
                name: "search_events",
                description: "Searches for calendar events matching a query",
                inputSchema: zodToJsonSchema(SearchEventsSchema),
            },
            {
                name: "list_calendars",
                description: "Lists all available calendars",
                inputSchema: zodToJsonSchema(ListCalendarsSchema),
            },
        ],
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            switch (name) {
                case "create_event": {
                    const validatedArgs = CreateEventSchema.parse(args);
                    
                    // Process start and end times
                    const startDateTime = parseDateTime(validatedArgs.start);
                    const endDateTime = parseDateTime(validatedArgs.end, startDateTime);
                    
                    // Prepare the event object
                    const event: any = {
                        summary: validatedArgs.summary,
                        start: {
                            dateTime: startDateTime.toISOString(),
                            timeZone: DEFAULT_TIMEZONE,
                        },
                        end: {
                            dateTime: endDateTime.toISOString(),
                            timeZone: DEFAULT_TIMEZONE,
                        },
                    };
                    
                    // Add optional fields if provided
                    if (validatedArgs.description) event.description = validatedArgs.description;
                    if (validatedArgs.location) event.location = validatedArgs.location;
                    if (validatedArgs.reminders) event.reminders = validatedArgs.reminders;
                    
                    // Add attendees if provided
                    if (validatedArgs.attendees && validatedArgs.attendees.length > 0) {
                        event.attendees = validatedArgs.attendees.map(email => ({ email }));
                    }
                    
                    // Insert the event
                    const response = await calendar.events.insert({
                        calendarId: validatedArgs.calendarId,
                        requestBody: event,
                    });
                    
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Event created successfully!\nEvent ID: ${response.data.id}\nTitle: ${response.data.summary}\nStart: ${formatDateTime(response.data.start)}\nEnd: ${formatDateTime(response.data.end)}\nLink: ${response.data.htmlLink}`,
                            },
                        ],
                    };
                }
                
                case "get_event": {
                    const validatedArgs = GetEventSchema.parse(args);
                    
                    const response = await calendar.events.get({
                        calendarId: validatedArgs.calendarId,
                        eventId: validatedArgs.eventId,
                    });
                    
                    const event = response.data;
                    
                    // Format attendees if present
                    let attendeesText = '';
                    if (event.attendees && event.attendees.length > 0) {
                        attendeesText = '\nAttendees:\n' + event.attendees.map(a => {
                            let status = '';
                            if (a.responseStatus) {
                                status = ` (${a.responseStatus.replace('needsAction', 'pending')})`;
                            }
                            return `- ${a.email}${status}`;
                        }).join('\n');
                    }
                    
                    // Format reminders if present
                    let remindersText = '';
                    if (event.reminders && event.reminders.overrides && event.reminders.overrides.length > 0) {
                        remindersText = '\nReminders:\n' + event.reminders.overrides.map(r => 
                            `- ${r.method} (${r.minutes} minutes before)`
                        ).join('\n');
                    }

                    // Handle the created date safely
                    const createdDate = event.created ? new Date(event.created).toLocaleString() : 'Unknown';
                    
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Event Details:\nID: ${event.id}\nTitle: ${event.summary}\nStart: ${formatDateTime(event.start)}\nEnd: ${formatDateTime(event.end)}\nLocation: ${event.location || 'Not specified'}\nDescription: ${event.description || 'No description'}\nCreated: ${createdDate}${attendeesText}${remindersText}\nLink: ${event.htmlLink}`,
                            },
                        ],
                    };
                }
                
                case "update_event": {
                    const validatedArgs = UpdateEventSchema.parse(args);
                    
                    // First, get the current event
                    const currentEvent = await calendar.events.get({
                        calendarId: validatedArgs.calendarId,
                        eventId: validatedArgs.eventId,
                    });
                    
                    // Prepare update object
                    const updatedEvent: any = {};
                    
                    // Add fields that are being updated
                    if (validatedArgs.summary) updatedEvent.summary = validatedArgs.summary;
                    if (validatedArgs.description) updatedEvent.description = validatedArgs.description;
                    if (validatedArgs.location) updatedEvent.location = validatedArgs.location;
                    
                    // Handle start time updates
                    if (validatedArgs.start) {
                        const startDateTime = parseDateTime(validatedArgs.start);
                        updatedEvent.start = {
                            dateTime: startDateTime.toISOString(),
                            timeZone: currentEvent.data.start?.timeZone || DEFAULT_TIMEZONE,
                        };
                    }
                    
                    // Handle end time updates
                    if (validatedArgs.end) {
                        // If start time was updated, use it as reference for end time
                        const referenceTime = validatedArgs.start ? 
                            parseDateTime(validatedArgs.start) : 
                            currentEvent.data.start?.dateTime ? new Date(currentEvent.data.start.dateTime) : new Date();
                            
                        const endDateTime = parseDateTime(validatedArgs.end, referenceTime);
                        updatedEvent.end = {
                            dateTime: endDateTime.toISOString(),
                            timeZone: currentEvent.data.end?.timeZone || DEFAULT_TIMEZONE,
                        };
                    }
                    
                    // Handle attendees updates
                    if (validatedArgs.attendees && validatedArgs.attendees.length > 0) {
                        updatedEvent.attendees = validatedArgs.attendees.map(email => ({ email }));
                    }
                    
                    // Perform the update
                    const response = await calendar.events.patch({
                        calendarId: validatedArgs.calendarId,
                        eventId: validatedArgs.eventId,
                        requestBody: updatedEvent,
                    });
                    
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Event updated successfully!\nEvent ID: ${response.data.id}\nTitle: ${response.data.summary}\nStart: ${formatDateTime(response.data.start)}\nEnd: ${formatDateTime(response.data.end)}\nLink: ${response.data.htmlLink}`,
                            },
                        ],
                    };
                }
                
                case "delete_event": {
                    const validatedArgs = DeleteEventSchema.parse(args);
                    
                    await calendar.events.delete({
                        calendarId: validatedArgs.calendarId,
                        eventId: validatedArgs.eventId,
                    });
                    
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Event with ID ${validatedArgs.eventId} has been successfully deleted from calendar ${validatedArgs.calendarId}.`,
                            },
                        ],
                    };
                }
                
                case "list_events": {
                    const validatedArgs = ListEventsSchema.parse(args);
                    
                    // Process time parameters
                    const now = new Date();
                    
                    // Default timeMin is now
                    const timeMin = validatedArgs.timeMin ? 
                        parseDateTime(validatedArgs.timeMin) : now;
                    
                    // Default timeMax (if not provided) is 7 days from timeMin
                    let timeMax = null;
                    if (validatedArgs.timeMax) {
                        timeMax = parseDateTime(validatedArgs.timeMax, timeMin);
                    } else {
                        timeMax = new Date(timeMin);
                        timeMax.setDate(timeMax.getDate() + 7);
                    }
                    
                    const response = await calendar.events.list({
                        calendarId: validatedArgs.calendarId,
                        timeMin: timeMin.toISOString(),
                        timeMax: timeMax.toISOString(),
                        maxResults: validatedArgs.maxResults,
                        orderBy: validatedArgs.orderBy,
                        singleEvents: true, // Expand recurring events
                    });
                    
                    const events = response.data.items || [];
                    
                    if (events.length === 0) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `No events found in the specified time range (${timeMin.toLocaleDateString()} - ${timeMax.toLocaleDateString()}).`,
                                },
                            ],
                        };
                    }
                    
                    // Format the events for display
                    const eventsDisplay = events.map((event, index) => {
                        const start = formatDateTime(event.start);
                        const end = formatDateTime(event.end);
                        return `${index + 1}. ${event.summary} (ID: ${event.id})\n   When: ${start} - ${end}\n   Where: ${event.location || 'Not specified'}\n`;
                    }).join('\n');
                    
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Found ${events.length} events between ${timeMin.toLocaleDateString()} and ${timeMax.toLocaleDateString()}:\n\n${eventsDisplay}`,
                            },
                        ],
                    };
                }
                
                case "search_events": {
                    const validatedArgs = SearchEventsSchema.parse(args);
                    
                    // Process time parameters
                    const now = new Date();
                    
                    // Default timeMin is now
                    const timeMin = validatedArgs.timeMin ? 
                        parseDateTime(validatedArgs.timeMin) : now;
                    
                    // Default timeMax (if not provided) is 30 days from timeMin
                    let timeMax = null;
                    if (validatedArgs.timeMax) {
                        timeMax = parseDateTime(validatedArgs.timeMax, timeMin);
                    } else {
                        timeMax = new Date(timeMin);
                        timeMax.setDate(timeMax.getDate() + 30);
                    }
                    
                    // Perform the search - Google Calendar API doesn't have a direct search endpoint,
                    // so we'll get events and filter them manually
                    const response = await calendar.events.list({
                        calendarId: validatedArgs.calendarId,
                        timeMin: timeMin.toISOString(),
                        timeMax: timeMax.toISOString(),
                        maxResults: 100, // Get more results for filtering
                        singleEvents: true,
                    });
                    
                    let events = response.data.items || [];
                    
                    // Filter events based on the query string
                    const query = validatedArgs.query.toLowerCase();
                    events = events.filter(event => {
                        const summary = (event.summary || '').toLowerCase();
                        const description = (event.description || '').toLowerCase();
                        const location = (event.location || '').toLowerCase();
                        
                        // Search in all text fields
                        return summary.includes(query) || 
                               description.includes(query) || 
                               location.includes(query);
                    });
                    
                    // Limit the number of results
                    events = events.slice(0, validatedArgs.maxResults);
                    
                    if (events.length === 0) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `No events found matching "${validatedArgs.query}" in the specified time range.`,
                                },
                            ],
                        };
                    }
                    
                    // Format the events for display
                    const eventsDisplay = events.map((event, index) => {
                        const start = formatDateTime(event.start);
                        const end = formatDateTime(event.end);
                        return `${index + 1}. ${event.summary} (ID: ${event.id})\n   When: ${start} - ${end}\n   Where: ${event.location || 'Not specified'}\n`;
                    }).join('\n');
                    
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Found ${events.length} events matching "${validatedArgs.query}":\n\n${eventsDisplay}`,
                            },
                        ],
                    };
                }
                
                case "list_calendars": {
                    const response = await calendar.calendarList.list();
                    
                    const calendars = response.data.items || [];
                    
                    if (calendars.length === 0) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: "No calendars found in your Google account.",
                                },
                            ],
                        };
                    }
                    
                    // Format the calendars for display
                    const calendarsDisplay = calendars.map((cal, index) => {
                        return `${index + 1}. ${cal.summary} (ID: ${cal.id})\n   Access: ${cal.accessRole}\n   Primary: ${cal.primary ? 'Yes' : 'No'}\n`;
                    }).join('\n');
                    
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Found ${calendars.length} calendars:\n\n${calendarsDisplay}`,
                            },
                        ],
                    };
                }

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        } catch (error: any) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: ${error.message}`,
                    },
                ],
            };
        }
    });

    const transport = new StdioServerTransport();
    server.connect(transport);
}

main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});