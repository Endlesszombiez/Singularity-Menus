"""Offline template catalog. No third-party assets or services required."""
from copy import deepcopy
from datetime import date
from uuid import uuid4


CATALOG = {
    "production": {
        "name": "Production task list", "category": "Operations", "icon": "tasks",
        "description": "Give every shift a clear plan. Tasks, owners, priorities and progress in one place.",
        "themes": ["Night shift", "Daylight", "Blueprint"],
        "title": "Today's production", "subtitle": "Floor 01 · Day shift · 07:00–15:30",
        "footer": "Start safe. Check your station and PPE before beginning work.",
        "columns": [["title", "Task"], ["owner", "Assigned to"], ["detail", "Work order / notes"], ["due", "Due"], ["priority", "Priority"], ["status", "Status"]],
        "items": [
            {"title": "Morning equipment checks", "owner": "All operators", "detail": "Complete station safety checklist", "due": "07:15", "priority": "High", "status": "Done"},
            {"title": "Fabricate mounting brackets", "owner": "Alex · Line A", "detail": "WO-2048 · 240 units · Check first article", "due": "10:30", "priority": "High", "status": "In progress"},
            {"title": "Assemble control panels", "owner": "Jordan · Line B", "detail": "WO-2049 · 36 units", "due": "12:00", "priority": "Normal", "status": "In progress"},
            {"title": "Inspect incoming materials", "owner": "Sam · Quality", "detail": "Receiving bay · Lot 1086", "due": "11:00", "priority": "Normal", "status": "To do"},
            {"title": "Package outbound orders", "owner": "Shipping team", "detail": "Orders 3102–3110 · Loading dock 2", "due": "14:30", "priority": "High", "status": "To do"},
            {"title": "Restock fastener bins", "owner": "Morgan · Stores", "detail": "Awaiting delivery confirmation", "due": "13:00", "priority": "Normal", "status": "Blocked"},
        ],
    },
    "briefing": {
        "name": "Shift briefing", "category": "Operations", "icon": "sun",
        "description": "Welcome the next shift with the priorities, handover notes and people to know.",
        "themes": ["Command", "Paper", "Signal"],
        "title": "Good morning, team.", "subtitle": "Day shift · Your briefing before the floor",
        "footer": "Questions? Speak to your shift lead before starting.",
        "columns": [["title", "Heading"], ["detail", "Briefing note"], ["owner", "Contact / team"]],
        "items": [
            {"title": "Today's focus", "detail": "Finish the Northstar order before the 14:30 collection. Line A has priority for materials.", "owner": "Production"},
            {"title": "From the night shift", "detail": "Press 03 is awaiting maintenance. Use Press 02 until cleared by engineering.", "owner": "Handover"},
            {"title": "Your shift leads", "detail": "Alex: production · Sam: quality · Morgan: materials", "owner": "People"},
            {"title": "Team huddle", "detail": "Meet at the planning board at 07:05. Bring any blockers from your station.", "owner": "Everyone"},
        ],
    },
    "announcements": {
        "name": "Noticeboard", "category": "Communication", "icon": "megaphone",
        "description": "Keep the whole team in the loop with timely notices and company updates.",
        "themes": ["Bulletin", "Editorial", "Electric"],
        "title": "Around the workplace", "subtitle": "The updates that matter to our team",
        "footer": "Have something to share? Contact your team lead.",
        "columns": [["title", "Headline"], ["detail", "Message"], ["owner", "Label"]],
        "items": [
            {"title": "Team lunch this Friday", "detail": "Join us in the break room at 12:00. Please share dietary requirements with the office.", "owner": "Team"},
            {"title": "New collection point", "detail": "All courier collections now leave from loading dock 2. Keep the marked walkway clear.", "owner": "Operations"},
            {"title": "Ideas welcome", "detail": "Spotted a way to make work safer or simpler? Add it to the improvement board.", "owner": "Your voice"},
        ],
    },
    "schedule": {
        "name": "Daily agenda", "category": "Planning", "icon": "calendar",
        "description": "Show meetings, training, events or the day's work in a readable timeline.",
        "themes": ["After hours", "Studio", "Timetable"],
        "title": "The day ahead", "subtitle": "Workshop · Meetings & milestones",
        "footer": "All times are local. Please arrive five minutes early.",
        "columns": [["time", "Time"], ["title", "Event"], ["detail", "Details"], ["owner", "Location / host"]],
        "items": [
            {"time": "07:05", "title": "Shift kickoff", "detail": "Priorities, safety check and task assignments", "owner": "Planning board"},
            {"time": "09:30", "title": "Quality review", "detail": "First-article sign-off for WO-2048", "owner": "Quality station"},
            {"time": "12:00", "title": "Lunch break", "detail": "Staggered breaks · Check with your lead", "owner": "Break room"},
            {"time": "14:30", "title": "Outbound collection", "detail": "Northstar order · Final dispatch check", "owner": "Loading dock 2"},
            {"time": "15:15", "title": "Shift handover", "detail": "Record blockers and reset your station", "owner": "Planning board"},
        ],
    },
    "metrics": {
        "name": "Performance dashboard", "category": "Operations", "icon": "chart",
        "description": "Make production targets, quality and progress visible at a glance.",
        "themes": ["Control room", "Clarity", "Terminal"],
        "title": "Every part counts.", "subtitle": "Production performance · Updated by your team",
        "footer": "Manual figures · Update this board when counts change.",
        "columns": [["title", "Metric"], ["value", "Current value"], ["target", "Target (number)"], ["unit", "Unit"], ["detail", "Context"]],
        "items": [
            {"title": "Units produced", "value": "186", "target": "240", "unit": "units", "detail": "Day shift output"},
            {"title": "Orders packed", "value": "7", "target": "9", "unit": "orders", "detail": "Today's dispatches"},
            {"title": "First-pass quality", "value": "98.5", "target": "99", "unit": "%", "detail": "Inspected this shift"},
            {"title": "Safety checks", "value": "12", "target": "12", "unit": "stations", "detail": "Ready for operation"},
        ],
    },
    "menu": {
        "name": "Café & menu", "category": "Hospitality", "icon": "coffee",
        "description": "A clear, flexible menu for a café, canteen, food truck or break room.",
        "themes": ["Midnight café", "Daily special", "Terracotta"],
        "title": "The break room", "subtitle": "Good food. A proper break.",
        "footer": "Please ask our team about allergens before ordering.",
        "columns": [["title", "Item"], ["detail", "Description"], ["price", "Price (including currency)"], ["owner", "Category"]],
        "items": [
            {"title": "Flat white", "detail": "Double espresso · Steamed milk", "price": "$3.50", "owner": "Coffee"},
            {"title": "Filter coffee", "detail": "Freshly brewed house blend", "price": "$2.50", "owner": "Coffee"},
            {"title": "Breakfast roll", "detail": "Egg, cheddar & your choice of filling", "price": "$5.50", "owner": "Kitchen"},
            {"title": "Soup of the day", "detail": "With warm sourdough", "price": "$6.00", "owner": "Kitchen"},
            {"title": "Roasted vegetable sandwich", "detail": "Hummus · Rocket · Seeded bread", "price": "$7.00", "owner": "Kitchen"},
        ],
    },
    "safety": {
        "name": "Safety & checklist", "category": "Operations", "icon": "shield",
        "description": "Keep essential procedures and safety reminders in everyone's line of sight.",
        "themes": ["Safety first", "Clear guidance", "Hazard"],
        "title": "A safe shift starts here.", "subtitle": "Before you start · Every station, every day",
        "footer": "Emergency? Follow your site's emergency plan and contact your supervisor.",
        "columns": [["title", "Check / reminder"], ["detail", "Instruction"], ["owner", "Responsible"]],
        "items": [
            {"title": "Wear the right PPE", "detail": "Safety footwear and eye protection are required on the production floor.", "owner": "Everyone"},
            {"title": "Check your equipment", "detail": "Inspect guards and emergency stops. Report defects before use.", "owner": "Operators"},
            {"title": "Keep routes clear", "detail": "No pallets, tools or deliveries in marked walkways and fire exits.", "owner": "Everyone"},
            {"title": "Report near misses", "detail": "Tell your lead about hazards and near misses so we can prevent the next incident.", "owner": "Everyone"},
        ],
    },
    "welcome": {
        "name": "Welcome & wayfinding", "category": "Communication", "icon": "compass",
        "description": "Welcome visitors and guide people to reception, meeting rooms and facilities.",
        "themes": ["Concierge", "Gallery", "Landmark"],
        "title": "Welcome to our workspace.", "subtitle": "We're glad you're here. Let us point you in the right direction.",
        "footer": "Visitors: please sign in at reception and wear your visitor badge.",
        "columns": [["title", "Destination"], ["detail", "Directions"], ["owner", "Floor / area"]],
        "items": [
            {"title": "Reception", "detail": "Straight ahead · Please sign in on arrival", "owner": "Ground floor"},
            {"title": "Meeting rooms", "detail": "Turn left past reception", "owner": "First floor"},
            {"title": "Production floor", "detail": "Authorised staff & escorted visitors only", "owner": "Ground floor"},
            {"title": "Break room", "detail": "Follow the corridor to your right", "owner": "Ground floor"},
        ],
    },
}


def new_board(template):
    spec = CATALOG[template]
    return {"id": uuid4().hex, "template": template, "name": spec["name"], "theme": 0,
            "title": spec["title"], "subtitle": spec["subtitle"], "footer": spec["footer"],
            "date": date.today().isoformat() if template == "production" else "",
            "page_seconds": 15, "items": deepcopy(spec["items"])}
