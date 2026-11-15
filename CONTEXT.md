# Trip Planning and Order Coordination

This context defines the shared product language for the MIS course prototype: one traveller's trip, booked items, planning suggestions, and coordination. It describes the proposed system, not verified capabilities or defects of Ctrip.

## Language

### Trip and booking

**Trip**:
A traveller's bounded journey, containing planned activities and references to any bookings. A trip may have more than one itinerary version.

**One-stop trip centre**:
The product concept for bringing trip planning, bookings, recommendations, and changes into one coherent place. It is the overall vision, not a claim that Ctrip's current functions are absent or unused.

**Itinerary item**:
A dated activity or travel segment in a trip, such as a flight, train ride, hotel stay, or attraction visit. An item is either planned or linked to a booking; those states must not be conflated.

**Booking**:
A confirmed reservation for a travel product. In the course prototype, a booking is simulated and only created after an explicit simulated-booking action. A booking is treated as a fixed fact: the assistant may identify a possible mismatch, but does not silently change or cancel it.

**Schedule conflict**:
A possible mismatch among dates, times, locations, trip plans, and bookings. A conflict is a reason to explain the mismatch and ask a clarifying question, not proof that a booking is wrong; a missing return booking is a possible gap, not automatically an error.

**Trip consistency check**:
A check run when a trip item or booking is added or updated. It surfaces possible date or schedule mismatches to the traveller but does not modify a booking or continuously monitor the trip.

**Cross-order trip change**:
A requested change to one part of a trip that may affect multiple bookings, such as moving a return date and consequently reviewing a hotel stay and an attraction booking. The assistant identifies affected bookings and options; it does not change a booking based only on an inferred conflict.

**Unbooked item**:
A proposed or planned itinerary item that has no confirmed booking. Selecting a recommendation adds an unbooked item; it remains unbooked until the user explicitly completes the prototype's simulated-booking flow.

### User and platform information

**User-side information**:
Travel preferences and useful travel history associated with the demo traveller. Preferences may be inferred and maintained in the background, but a recommendation must not present an inference as a fact the user explicitly stated.

**Platform-side information**:
Travel product options and their attributes, filters, and simulated availability or prices. It is separate from user-side preferences and from confirmed booking records.

**Product recommendation**:
A set of candidate travel products selected against the traveller's request, relevant user-side information, and available platform-side attributes. Important choices such as transport type, dates, budget, and hotel filters are presented as explicit options rather than hidden assumptions.

### Assistant interaction

**Travel assistant**:
A task-focused helper for organizing a trip, checking possible conflicts, asking for missing constraints, and presenting product options. It is not an autonomous agent that changes confirmed bookings or purchases products without the user's direction.

**Extracted request**:
The relevant intent and constraints derived from the current user message. Unimportant conversation does not need to become long-term memory.

**Image itinerary candidate**:
Travel details extracted from a user-provided image, shown for review before being added to the trip. If sensitive identity or contact information is detected, image processing stops and the user is told why.

## Example Dialogue

**Developer:** The traveller moves the return date from March 5 to March 4. Should the assistant automatically change the hotel and attraction bookings?

**Domain expert:** No. It should identify which bookings may be affected and present the relevant options. Confirmed bookings remain unchanged unless the traveller chooses a change.

**Developer:** The traveller has no return ticket and asks for a recommendation. Is the first suggestion already a booking?

**Domain expert:** No. The assistant asks for relevant constraints, presents filtered options, and leaves the item unbooked until the traveller completes the booking flow.

**Developer:** The traveller clicks a suggested train. Is that now booked?

**Domain expert:** No. It becomes a planned, unbooked item. Only the separate simulated-booking action creates a simulated booking.

## Flagged Ambiguities

- Claims that Ctrip's existing planning features are hard to find, fragmented, overly commercial, poorly used, or weakly connected to orders are research hypotheses until supported by dated product walkthroughs, user research, or reliable usage data.
- Claims that most users only use Ctrip for simple bookings, that integration would materially improve retention or business value, or that the required technology is moderately difficult need evidence or must be labeled as assumptions.
