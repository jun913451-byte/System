# Trip Planning and Order Coordination

**Demo exception (2026-11-19):** An explicit request to return one day later can update the current trip's uniquely matched local return order and linked stay ending on the original return date and extend the itinerary by one day. The assistant reports the changes; this does not execute real supplier transactions. Cross-city overlapping hotel stays are soft warnings, while same-city overlapping stays for the same traveller remain hard conflicts. This exception supersedes conflicting general statements below for this scenario only.

This context defines the shared product language for the MIS course prototype: one traveller's trip, booked items, planning suggestions, and coordination. It describes the proposed system and its domain rules, not verified capabilities or defects of Ctrip. Hangzhou is an example destination, not the scope of the product. Definitions and intended behaviour below do not by themselves establish implementation; planned or incomplete features are identified where known.

## Language

### Trip and booking

**Trip**:
A traveller's bounded journey, containing planned activities and references to any bookings. A trip may have more than one itinerary version.

**Travel project**:
A traveller's workspace for one bounded trip, created when planning begins. It brings that trip's itinerary, booking references, events, and agent runs together, while general travel preferences remain user-level memory.

**One-stop trip centre**:
The product concept for bringing trip planning, bookings, recommendations, and changes into one coherent place. It is the overall vision, not a claim that Ctrip's current functions are absent or unused.

**Itinerary item**:
A dated activity or travel segment in a trip, such as a flight, train ride, hotel stay, or attraction visit. An item is either planned or linked to a booking; those states must not be conflated.

**Booking**:
A confirmed reservation for a travel product, referred to as an order in traveller-facing pages. Every order records the specific traveller or travellers; a passenger or guest count alone is insufficient. In the course prototype, it is recorded only after the traveller confirms the booking flow and appears in the traveller's orders. A purchase defaults to no travel project; the traveller may explicitly select a project during checkout or change the association for an upcoming order in order details. It does not represent a real supplier transaction. Development-only virtual orders are test fixtures, not traveller orders. A booking is normally read-only to the assistant. In conflict handling only, the assistant may present one precisely identified operation for one order at a time, including exact replacement values where applicable, and apply it to the local demo order only after the traveller explicitly confirms that proposal. A correction or changed request invalidates the proposal and requires a new confirmation. For multi-order changes, reassess after each confirmed operation before proposing another. Real supplier changes, payments, fees, and refunds remain for the traveller to handle. The traveller may also perform eligible date changes or cancellations in order details, subject to the local product rules. Orders are grouped with upcoming and in-progress orders first and completed orders last.

The assistant may update itinerary arrangements but cannot purchase products or perform real financial actions. A newly confirmed booking associated with a project triggers a consistency check; if it has no clear conflict with the trip, the itinerary is adjusted to reflect the booking, linking a matching unbooked arrangement or adding the booked item when no match exists. If a conflict exists, the order is still recorded and the assistant explains the impact, offers a concise itinerary adjustment, and discusses it with the traveller before changing the itinerary. A clear affirmative reply such as “可以” or “按这个调整” authorizes only the proposed itinerary change. For an order operation proposed during conflict handling, confirmation applies only to the named order and exact operation; unclear or revised instructions require clarification and a new proposal. Multiple order operations are proposed and confirmed sequentially, with a fresh assessment after each. Real supplier changes, payments, fees, and refunds remain for the traveller to handle. Conflict handling uses dialogue rather than generic accept/reject controls; the specific order proposal still requires explicit confirmation. A conflict triggers a proactive warning; a conflict-free adjustment is handled quietly.

**Saved traveller**:
A reusable record of a traveller or companion, selected or added through the shared traveller-selection experience in single-item and multi-item checkout, then associated with each resulting order; any examples must be fictional.

**Schedule conflict**:
A possible mismatch among dates, times, locations, trip plans, and bookings. Classify each conflict on two independent dimensions: severity (hard or soft) and project scope (within one project or cross-project). An order with no project association is neither; do not infer one. Conflict type, such as transport, hotel, weather, or location, is a separate attribute. A conflict is not proof that a booking is wrong, and a missing return booking is a possible gap, not automatically an error.

**Hard conflict**:
A conflict determined by business rules from known facts, such as the same traveller having overlapping hotel stays, overlapping transport, or transport connections that are too close in time. Hard conflicts can occur within one project or across projects; check all valid orders for the same traveller regardless of project association. A short connection is hard only when the relevant airport or station is known well enough to assess the transfer; city-level origin and destination alone are insufficient and can support only a soft warning. For the demo, use a 2-hour minimum for connections at the same airport and 30 minutes at the same railway station; when transfer details between different hubs are unavailable, do not classify the connection as hard. A conflict triggered by a newly added order is anchored to that order and identifies the conflicting order and its project. If both orders belong to different projects, notify both project dialogues and navigation indicators, while keeping one top-right notification and a shared read state. If the order is later associated with another project, update the affected project surfaces without duplicating the conflict event or changing its read state. Orders-area warning and page-level warning point to the triggering order. When the newly added order has no associated project, show it in the orders area and top-right notification centre and use the page-level warning; do not create a project dialogue or assistant-navigation notification or infer a project association.

**Soft conflict**:
A potentially important mismatch that business rules cannot establish as a hard conflict, such as weather affecting an outdoor plan, a newly purchased ticket whose origin does not fit the trip's location, or an order date outside the associated trip's date range. Soft conflicts can occur within one project or across projects; project scope does not change severity. Notify through the affected AI trip assistant dialogue(s) and top-right notification centre only; for a cross-project conflict, notify both affected projects but keep one top-right entry and shared read state. If an order has no project association, use only the top-right notification centre and open the AI trip assistant without assigning a project. Do not show an order conflict warning or page-level warning. Automatically resolve the alert only when new information establishes that its cause no longer applies; retain it when the state remains uncertain.

**Trip consistency check**:
A check for a project when a traveller states a new trip intent or an associated booking is added. It surfaces only mismatches supported by known dates, times, and arrangements; missing data is reported as uncertainty, not treated as a conflict. Any resulting order operation follows the explicit, one-order-at-a-time conflict-resolution rule.

**Trip event**:
A material change related to a trip, such as an associated newly confirmed booking or a newly stated activity that conflicts with the itinerary. Scheduled reminders are a future extension. An associated confirmed booking may trigger reassessment of the trip and related arrangements.

**Proactive assistant message**:
A message initiated by the assistant for a trip event, distinct from a reply to the traveller's latest message. Conflict messages have a visual marker; broader proactive AI reminders and scheduled delivery remain future work.

**Conflict alert**:
A proactive assistant message about a hard or soft conflict. Multiple conflicts found in one consistency check are grouped into one concise message listing affected arrangements and conflict types, while each conflict remains independently trackable. A conflict discovered while the traveller is already discussing that project is explained in the current reply without a duplicate page-level warning or unread project indicator. In this case, a hard conflict remains visible beside the related order, while a soft conflict stays in the dialogue; neither creates a new top-right unread notification. Other affected projects in a cross-project conflict still receive their normal notification. The traveller may address only some of them; apply only the itinerary changes explicitly requested and leave other conflicts unresolved. After a partial adjustment, briefly list the remaining unresolved conflicts in the same reply without sending another alert. If the traveller does not respond, leave the itinerary unchanged and the conflict unresolved without repeatedly prompting; notification read state is separate from whether the conflict is resolved. If the traveller explicitly acknowledges a conflict but keeps the current plan, stop surfacing it as unread while retaining the unresolved conflict in history. Its notification surfaces and shared read behavior follow the conflict's classification and project scope. From the top-right notification centre, hard conflicts open the triggering order and soft conflicts open the triggering project's dialogue; a project-level indicator opens that project's dialogue.

**Unread trip notification**:
A signal that a trip-related event has not yet been read. For a conflict, all applicable notification surfaces share a single read state; marking it read on one surface clears its unread indicators on the others. Resolved conflict alerts remain in history but sort below unresolved alerts. Do not assume every assistant response generates an unread notification.

**Trip weather advice**:
Advice grounded in real forecast data available for the trip destination and dates. When weather creates a conflict with an outdoor arrangement, the assistant explains the impact and discusses a concise adjustment with the traveller before changing the itinerary; confirmed bookings remain unchanged. When a forecast is unavailable or outside its coverage, use a general reminder to pay attention to travel weather without inventing a forecast.

**Time-based reminder**:
A planned proactive message scheduled for a relevant trip time and delivered in that trip's dialogue. Scheduled delivery and broader AI reminder refinement are future work; a detected conflict alert is a separate event.

**Cross-order trip change**:
A requested change to one part of a trip that may affect multiple bookings, such as moving a return date and consequently reviewing a hotel stay and an attraction booking. The assistant identifies affected orders and proposes one precise local demo-order operation at a time. It applies that operation only after explicit confirmation, then reassesses the remaining orders and itinerary. Real supplier changes, payments, fees, and refunds remain traveller-handled.

**Conflict handling conversation**:
A dedicated conversation for conflicts spanning multiple travel projects, with a conflict-management view beside it. Conflicts contained within one project remain in that project's ordinary conversation. An order with no project association is handled from its order detail and the notification centre; no project is inferred.

**Unbooked item**:
A proposed or planned itinerary item that has no confirmed booking. Explicitly adding a recommendation as a plan creates an unbooked item; viewing a recommendation alone does not. It remains unbooked until the user explicitly completes the prototype's simulated-booking flow.

**Conversational itinerary update**:
An itinerary generated in response to the traveller's dialogue request. Once the assistant has completed its response, the new itinerary directly replaces the trip's unbooked arrangements; confirmed bookings remain unchanged. The traveller can request further changes through dialogue, with no separate accept-or-reject action.

### User and platform information

**User-side information**:
Travel preferences and useful travel history associated with the demo traveller. A recommendation must not present an inferred preference as a fact the user explicitly stated; a candidate long-term preference is retained only after confirmation.

**Platform-side information**:
Travel product options and their attributes, filters, and simulated availability or prices. It is separate from user-side preferences and from confirmed booking records.

**Travel package**:
An existing curated combination of transport, accommodation, and attractions. Package recommendations must come from the platform catalogue. Its detail page links each component to the same product detail and purchase flow used by the corresponding channel.

**Product recommendation**:
A set of candidate travel products selected against the traveller's request, relevant user-side information, and available platform-side attributes. The model must not invent packages; package recommendations and links are intended behaviour, not established implementation. Important choices such as transport type, dates, budget, and hotel filters are presented as explicit options rather than hidden assumptions. When several products match, a lowest listed simulated price may be shown as a reference, not as a claim of real-time best value. A displayed candidate is not a booking; viewing it does not create an order. A local or destination-internal transport segment is not by itself a request to shop for a ticket; show a purchase option only when the traveller asks to buy or an exact route-and-date product match is available. For the course demo, surface at most one matching travel package per project and hide the package entry when there is no match.

**Product deep link**:
A link from an itinerary product candidate to its channel flow: transport opens the matching mode's result list for the same date and route, with the candidate highlighted; the assistant itinerary shows one candidate that best fits that day's schedule, using listed demo price only as a tie-breaker, while the full result list remains available. A hotel opens its hotel detail; an attraction opens its attraction detail from the attraction catalogue; and a travel package opens its package detail. Returning from any of these flows restores the same assistant project, selected day, and scroll position. After purchase, show the order success page with actions to return to the trip or view orders. Existing itinerary entry points for transport, hotels, and attractions are retained. A package entry appears before Day 1 in the day-selection strip, but Day 1 remains selected by default. For the course demo, flight and train ticket coverage is guaranteed for the selected demo route and dates, currently tentatively Hangzhou to Shenyang. A script may generate local demo ticket data for that scenario; the model must not invent ticket data, and generated demo tickets do not represent real availability or booking.

**Travel memory**:
Travel preferences and trip facts explicitly confirmed by the traveller that remain useful across tasks. A one-time request stays in active task context and may override a memory for that trip without changing it; a candidate long-term preference is retained only after the traveller confirms it.

### Assistant interaction

**Travel assistant**:
A task-focused helper for organizing a trip, checking possible conflicts, asking for missing constraints, and presenting product options. It is not an autonomous agent that changes confirmed bookings or purchases products without the user's direction.

**Active task context**:
The request, relevant trip and booking facts, constraints, and unresolved questions needed for the current planning or change task. It is distinct from travel memory and does not require retaining the full conversation.

**Agent run**:
A task-scoped response to a traveller request or trip event. It uses relevant travel memory and active task context to produce a conversational itinerary update or other result; it may end without a user-facing message when no action is needed, and it does not independently change a confirmed booking.

**Extracted request**:
The normalized intent and constraints derived from structured planning inputs and supplementary text for the active task. The assistant need not expose this internal interpretation, and asks for clarification only when a decision-relevant constraint is missing or contradictory.

**Image itinerary candidate**:
Travel details extracted from a user-provided image, shown for review before being added to the trip. If sensitive identity or contact information is detected, image processing stops and the user is told why.

## Example Dialogue

**Developer:** The traveller moves the return date from March 5 to March 4. Should the assistant automatically change the hotel and attraction bookings?

**Domain expert:** It may adjust the itinerary around confirmed bookings after the traveller states what they want. If resolving a conflict requires changing a booking, it proposes one exact order action and waits for confirmation before changing only that local demo order; real supplier handling and money remain with the traveller.

**Developer:** The traveller has no return ticket and asks for a recommendation. Is the first suggestion already a booking?

**Domain expert:** No. The assistant asks for relevant constraints, presents filtered options, and leaves the item unbooked until the traveller completes the booking flow.

**Developer:** The traveller clicks a suggested train. Is that now booked?

**Domain expert:** No. Viewing a suggested product does not by itself add a planned item or create a booking. Only a separate explicit simulated-booking action creates a simulated booking.

**Developer:** The traveller asks for a hotel near a metro station for this trip. Should the assistant remember that preference for future trips?

**Domain expert:** Not without confirmation. The assistant may ask, “您是喜欢住在离地铁近的酒店吗？需不需要小程将此作为您的长期偏好？” and retain it only if the traveller agrees.

## Flagged Ambiguities

- Claims that Ctrip's existing planning features are hard to find, fragmented, overly commercial, poorly used, or weakly connected to orders are research hypotheses until supported by dated product walkthroughs, user research, or reliable usage data.
- Claims that most users only use Ctrip for simple bookings, that integration would materially improve retention or business value, or that the required technology is moderately difficult need evidence or must be labeled as assumptions.
- Reminder scheduling, weather integration, and broader proactive AI reminders require later design and implementation. Existing associated-order conflict alerts are a narrower capability.
- README and ADR 0003 retain earlier wording about the project scope or event handling; reconcile them when those files are in scope. The development-only test-order default is separate from the customer purchase default.
