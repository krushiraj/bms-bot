# Button-Based UX Design

## Overview

Convert the BMS Bot from text-command based interactions to a full inline button experience. All navigation happens via inline keyboards with messages updating in-place (no chat clutter).

## Changes Summary

1. Hide cancelled jobs from `/myjobs` list
2. Main menu with navigation buttons after `/start`
3. Button-based job creation (city, dates as buttons; movie, theatre as text)
4. Button-based job list with tap-to-view details and cancel
5. Button-based card management with add/remove flows
6. Button-based settings for notifications and contact info

---

## Section 1: Main Menu & Navigation

After `/start` (or `/menu`), the bot sends a welcome message with an inline keyboard:

```
BMS Bot - Main Menu

What would you like to do?

[New Job]  [My Jobs]
[My Cards] [Settings]
```

**Behavior:**
- Tapping any button updates the same message (no new messages)
- Each screen has a `Back` button to return to main menu
- `/start` always shows this menu

**Navigation flow:**
```
Main Menu
-- New Job -> Job creation flow
-- My Jobs -> List of active jobs
-- My Cards -> List of gift cards
-- Settings -> Notification preferences, contact info
```

---

## Section 2: Job Creation Flow

**Step 1 - Movie Name (text input)**
```
Create New Booking Job

Step 1/5: Movie Name
What movie do you want to book?

Type the movie name:

[Cancel]
```

**Step 2 - City (buttons)**
```
Movie: Pushpa 2

Step 2/5: City
Select your city:

[Hyderabad] [Bangalore] [Mumbai]
[Delhi]     [Chennai]   [Kolkata]
[Pune]      [Other...]
[Cancel]
```

**Step 3 - Theatre (text input)**
```
Movie: Pushpa 2
City: Hyderabad

Step 3/5: Theatre(s)
Which theatre(s)? (comma separated)

Popular: AMB Cinemas, PVR, INOX, Cinepolis

Type theatre names:

[Back] [Cancel]
```

**Step 4 - Date (buttons, multi-select)**
```
Movie: Pushpa 2
City: Hyderabad
Theatre: AMB Cinemas

Step 4/5: Preferred Date
Select date(s): (tap multiple, then Done)

[28 Dec] [29 Dec] [30 Dec] [31 Dec]
[1 Jan]  [2 Jan]  [3 Jan]  [Any Date]
[Done]
[Back] [Cancel]
```
Shows next 7 days. Multi-select with toggle.

**Steps 5 & 6** - Time and Seats (already button-based, keep existing implementation)

---

## Section 3: My Jobs

**Jobs List View**
```
Your Booking Jobs

1. Pushpa 2 - WATCHING
   AMB Cinemas - 28 Dec - 2 seats

2. Avatar 3 - PENDING
   PVR Forum - 29 Dec - 4 seats

[Pushpa 2] [Avatar 3]
[Back]
```
Only shows active jobs (PENDING, WATCHING, BOOKING, AWAITING_CONSENT).
Cancelled and completed jobs are hidden from this list.

**Empty State**
```
Your Booking Jobs

You don't have any active jobs.

[Create New Job]
[Back]
```

**Job Details View**
```
Job Details

Pushpa 2
Hyderabad - AMB Cinemas
28 Dec - Evening
2 seats
Status: WATCHING

Watch until: 28 Dec, 5:00 PM

[X Cancel Job]
[Back to Jobs]
```

**Cancel Confirmation**
```
Cancel Job?

Are you sure you want to cancel the booking job for Pushpa 2?

[X Yes, Cancel] [No, Go Back]
```

**After Cancellation**
```
Job cancelled.

Pushpa 2 booking job has been cancelled.

[My Jobs] [Main Menu]
```

---

## Section 4: My Cards

**Cards List View**
```
Your Gift Cards

1. ****1234 - Rs.500
   Added: 25 Dec 2024

2. ****5678 - Rs.1000
   Added: 20 Dec 2024

[****1234] [****5678]
[Add Card]
[Back]
```

**Empty State**
```
Your Gift Cards

You don't have any gift cards saved.

[Add Card]
[Back]
```

**Card Details View**
```
Card Details

Card: ****1234
Balance: Rs.500
Added: 25 Dec 2024

[X Remove Card]
[Back to Cards]
```

**Add Card Flow**
```
Add Gift Card

Enter card number and PIN separated by space:

Example: 1234567890123456 123456

[Cancel]
```

**Add Card Success**
```
Card Added!

Card ****1234 has been saved securely.

[My Cards] [Main Menu]
```

**Remove Confirmation**
```
Remove Card?

Are you sure you want to remove card ****1234?

[X Yes, Remove] [No, Go Back]
```

---

## Section 5: Settings

**Settings Menu**
```
Settings

[Notifications]
[Contact Info]
[Back]
```

**Notifications View**
```
Notification Preferences

Get notified when:

[Yes - Job Started]
[Yes - Tickets Found]
[Yes - Booking Complete]
[No - Job Expired]

Tap to toggle on/off

[Back to Settings]
```

**Contact Info View**
```
Contact Info

Email: john@example.com
Phone: ****5678

This info is used for BMS booking confirmation.

[Update Contact]
[Back to Settings]
```

**Update Contact Flow**
```
Update Contact Info

Enter email and phone separated by space:

Example: john@example.com 9876543210

[Cancel]
```

**No Contact Set**
```
Contact Info

No contact info set yet.
Required for BMS booking confirmation.

[Set Contact]
[Back to Settings]
```

---

## Technical Implementation Notes

### Callback Data Format
Use prefixed callback data for routing:
- `menu:main`, `menu:jobs`, `menu:cards`, `menu:settings`
- `job:create`, `job:view:<id>`, `job:cancel:<id>`, `job:confirm_cancel:<id>`
- `card:view:<id>`, `card:add`, `card:remove:<id>`, `card:confirm_remove:<id>`
- `city:<name>`, `date:<value>`, `date:toggle:<value>`, `date:done`
- `notify:toggle:<type>`
- `nav:back`, `nav:back:<screen>`

### Session State
Track current flow state in session:
- `screen`: Current screen being displayed
- `messageId`: Message ID to edit for in-place updates
- `jobDraft`: Job creation draft data
- `selectedDates`: Array for multi-select date picking

### Message Editing
Always use `ctx.editMessageText()` instead of `ctx.reply()` to update in-place.
Store the message ID in session after initial send.

### Error Handling
If message edit fails (e.g., message too old), send a new message and update session with new message ID.
