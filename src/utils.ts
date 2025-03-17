/**
 * Utility functions for Google Calendar MCP server
 * Handles date/time parsing, formatting, and natural language processing
 */

// Regular expression to check if a string is in ISO format
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

/**
 * Parse date and time from various formats including natural language
 * @param dateTimeString Date/time string in ISO format or natural language
 * @param referenceDate Optional reference date for relative times
 * @returns Date object
 */
export function parseDateTime(dateTimeString: string, referenceDate?: Date): Date {
    // If already in ISO format, parse directly
    if (ISO_DATE_REGEX.test(dateTimeString)) {
        return new Date(dateTimeString);
    }

    // Set default reference date to now if not provided
    const reference = referenceDate || new Date();
    const lowerString = dateTimeString.toLowerCase().trim();

    // Handle common natural language patterns
    if (lowerString === 'now' || lowerString === 'today') {
        return new Date();
    }

    if (lowerString === 'tomorrow') {
        const tomorrow = new Date(reference);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0); // Default to 9 AM
        return tomorrow;
    }

    // Handle "X hours later" pattern
    const hoursLaterMatch = lowerString.match(/(\d+)\s*hours?\s*later/i);
    if (hoursLaterMatch) {
        const hoursToAdd = parseInt(hoursLaterMatch[1], 10);
        const result = new Date(reference);
        result.setHours(result.getHours() + hoursToAdd);
        return result;
    }

    // Handle "X days later" pattern
    const daysLaterMatch = lowerString.match(/(\d+)\s*days?\s*later/i);
    if (daysLaterMatch) {
        const daysToAdd = parseInt(daysLaterMatch[1], 10);
        const result = new Date(reference);
        result.setDate(result.getDate() + daysToAdd);
        return result;
    }

    // Handle "next week" pattern
    if (lowerString === 'next week') {
        const nextWeek = new Date(reference);
        nextWeek.setDate(nextWeek.getDate() + 7);
        nextWeek.setHours(9, 0, 0, 0); // Default to 9 AM
        return nextWeek;
    }

    // Handle days of week (e.g., "next monday")
    const dayOfWeekMatch = lowerString.match(/next\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (dayOfWeekMatch) {
        const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
            .indexOf(dayOfWeekMatch[1].toLowerCase());
        
        const result = new Date(reference);
        const currentDay = result.getDay();
        
        // Calculate days to add to get to the specified day
        let daysToAdd = dayOfWeek - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7; // Ensure we're moving to "next" week if needed
        
        result.setDate(result.getDate() + daysToAdd);
        result.setHours(9, 0, 0, 0); // Default to 9 AM
        return result;
    }

    // Handle specific times on relative dates (e.g., "tomorrow at 3pm")
    const dateTimeMatch = lowerString.match(/(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d+)(?::(\d+))?\s*(am|pm)?/i);
    if (dateTimeMatch) {
        // Parse the date part
        let dateResult: Date;
        const datePart = dateTimeMatch[1].toLowerCase();
        
        if (datePart === 'today') {
            dateResult = new Date(reference);
        } else if (datePart === 'tomorrow') {
            dateResult = new Date(reference);
            dateResult.setDate(dateResult.getDate() + 1);
        } else {
            // Handle day of week
            const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
                .indexOf(datePart);
            
            dateResult = new Date(reference);
            const currentDay = dateResult.getDay();
            
            // Calculate days to add to get to the specified day
            let daysToAdd = dayOfWeek - currentDay;
            if (daysToAdd <= 0) daysToAdd += 7; // Move to next week
            
            dateResult.setDate(dateResult.getDate() + daysToAdd);
        }
        
        // Parse the time part
        let hour = parseInt(dateTimeMatch[2], 10);
        const minute = dateTimeMatch[3] ? parseInt(dateTimeMatch[3], 10) : 0;
        const isPM = dateTimeMatch[4]?.toLowerCase() === 'pm';
        
        // Adjust hour for PM if needed
        if (isPM && hour < 12) hour += 12;
        if (!isPM && hour === 12) hour = 0; // 12 AM is 00:00
        
        dateResult.setHours(hour, minute, 0, 0);
        return dateResult;
    }

    // Try using the built-in Date parser as a fallback
    const date = new Date(dateTimeString);
    if (!isNaN(date.getTime())) {
        return date;
    }

    // If all parsing attempts fail, throw an error
    throw new Error(`Unable to parse date/time: ${dateTimeString}`);
}

/**
 * Format a date/time object or Google Calendar datetime object for display
 * @param dateTimeObj Date object or Google Calendar dateTime object
 * @returns Formatted date/time string
 */
export function formatDateTime(dateTimeObj: any): string {
    if (!dateTimeObj) return 'Not specified';

    // Handle Google Calendar API's date/dateTime format
    if (typeof dateTimeObj === 'object' && (dateTimeObj.dateTime || dateTimeObj.date)) {
        // For all-day events, use date format
        if (dateTimeObj.date) {
            const date = new Date(dateTimeObj.date + 'T00:00:00');
            return date.toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) + ' (All day)';
        }
        
        // For regular events with specific times
        const date = new Date(dateTimeObj.dateTime);
        return date.toLocaleString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    }

    // Handle JavaScript Date objects
    if (dateTimeObj instanceof Date) {
        return dateTimeObj.toLocaleString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    }

    // Handle ISO strings
    if (typeof dateTimeObj === 'string') {
        return new Date(dateTimeObj).toLocaleString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    }

    // Default fallback
    return String(dateTimeObj);
}