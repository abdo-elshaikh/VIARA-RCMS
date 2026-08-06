# AI Agent Prompt: Full UX and UI Design Audit

Act as a senior UX researcher, product designer, accessibility specialist, frontend architect, and usability QA engineer.

Perform a complete user-experience and interface-design audit of the entire application.

The primary objective is to identify usability issues, design inconsistencies, accessibility barriers, confusing workflows, weak information hierarchy, responsive-layout problems, localization defects, missing system states, and opportunities to reduce user error and task completion time.

Do not limit the review to visual styling. Evaluate the complete experience from the user's goal through navigation, interaction, system feedback, error recovery, and task completion.

## 1\. Initial Review

Before making changes:

1. Inspect the full application structure.
2. Identify all user roles.
3. Identify every route and major page.
4. Identify the design system, component library, typography, colors, spacing, icons, themes, localization, and responsive behavior.
5. Run the application and review every accessible workflow.
6. Capture the current behavior in desktop, tablet, and mobile views.
7. Review English and Arabic where supported.
8. Review light and dark modes.
9. Record console errors, layout overflow, accessibility problems, and inconsistent patterns.

Build a complete inventory of:

- Pages
- Workflows
- Forms
- Tables
- Modals
- Drawers
- Alerts
- Empty states
- Loading states
- Error states
- Permissions
- Navigation paths

## 2\. User Roles and Goals

For every role, document:

- Primary goals
- Frequent tasks
- High-risk tasks
- Required information
- Time-sensitive actions
- Common mistakes
- Permissions
- Devices likely to be used
- Language and direction requirements

Evaluate the application from the perspective of each role rather than from the perspective of the code structure.

## 3\. Workflow Audit

For each critical workflow, trace:

User goal  
→ Entry point  
→ Navigation  
→ Data shown  
→ User action  
→ Validation  
→ System response  
→ Error handling  
→ Completion  
→ Next step

For every workflow, identify:

- Number of steps
- Number of clicks
- Required decisions
- Repeated data entry
- Unclear terminology
- Hidden actions
- Unnecessary interruptions
- Error-prone steps
- Missing confirmation
- Missing recovery options
- Missing feedback
- User dead ends
- Inconsistent navigation
- Delays or performance friction

Review both the happy path and failure paths.

## 4\. Information Architecture

Evaluate:

- Main navigation
- Sidebar
- Header
- Breadcrumbs
- Page titles
- Menus
- Tabs
- Search
- Filters
- Grouping
- Naming
- Content hierarchy

Identify:

- Duplicate destinations
- Ambiguous labels
- Deep navigation
- Inconsistent terminology
- Features placed in unexpected locations
- Missing back-navigation
- Hidden high-frequency actions
- Low-priority items occupying prominent positions

Recommend a clearer structure where needed.

## 5\. Visual Hierarchy

For every page, verify that users can immediately identify:

1. Where they are
2. What the page is for
3. What information matters most
4. What action they should take
5. What actions are secondary
6. What requires attention
7. What the current status is

Audit:

- Headings
- Typography
- Spacing
- Alignment
- Contrast
- Color emphasis
- Card hierarchy
- Button hierarchy
- Status indicators
- Alerts
- Density
- Whitespace

Identify screens where too many elements compete for attention.

## 6\. Design-System Consistency

Audit all components for consistency:

- Buttons
- Inputs
- Selects
- Checkboxes
- Radio buttons
- Switches
- Cards
- Tables
- Tabs
- Badges
- Alerts
- Toasts
- Modals
- Drawers
- Tooltips
- Pagination
- Dropdowns
- Skeletons
- Empty states
- Error states

Check:

- Heights
- Padding
- Font sizes
- Border radius
- Icons
- Colors
- Shadows
- Hover states
- Focus states
- Disabled states
- Loading states
- Error states
- Selected states

Identify duplicate patterns and recommend reusable components or design tokens.

## 7\. Forms

Review every form for:

- Clear labels
- Required-field indication
- Logical field order
- Grouped related fields
- Helpful defaults
- Input masks
- Autocomplete
- Inline validation
- Error placement
- Error clarity
- Preservation of entered data
- Keyboard navigation
- Mobile keyboard type
- Submission feedback
- Duplicate-submission protection
- Unsaved-change warnings
- Destructive-action confirmation

Identify fields that can be removed, combined, defaulted, or prefilled.

## 8\. Tables and Data-Heavy Screens

For each table or worklist, assess:

- Column necessity
- Column order
- Visual density
- Sorting
- Filtering
- Searching
- Pagination
- Sticky headers
- Row selection
- Bulk actions
- Row actions
- Status visibility
- Truncation
- Long content
- Empty state
- Loading state
- Error state
- Mobile behavior

Verify that urgent, incomplete, abnormal, or actionable records are easy to identify.

Avoid hiding critical information solely to fit the screen.

## 9\. Feedback and System Status

Verify that the application always communicates:

- Loading
- Saving
- Uploading
- Processing
- Success
- Failure
- Partial completion
- Background activity
- Connection loss
- Retry status
- Permission denial
- Empty results
- Unsaved changes

Identify silent actions, ambiguous messages, and generic errors.

Every error message should explain:

- What happened
- Why it happened, when safe
- Whether user data is preserved
- What the user can do next

## 10\. Error Prevention and Recovery

Review whether the interface prevents:

- Duplicate records
- Duplicate submission
- Wrong-patient selection
- Wrong-study selection
- Conflicting scheduling
- Invalid state changes
- Accidental deletion
- Accidental publication
- Duplicate payment
- Excessive refund
- Unsaved report loss
- Unauthorized action

Recommend confirmations, warnings, constraints, undo, recovery, or safer defaults where appropriate.

## 11\. Accessibility

Audit against WCAG 2.1 AA principles.

Test:

- Keyboard-only usage
- Focus order
- Visible focus
- Screen-reader labels
- Semantic HTML
- Heading hierarchy
- Dialog focus management
- Skip navigation
- Contrast
- Zoom
- Touch targets
- Error identification
- Live regions
- Reduced motion
- Color-independent meaning
- Alternative text
- Table semantics

Do not rely only on automated accessibility tools. Combine automated checks with keyboard and screen-reader-oriented review.

## 12\. Responsive Design

Review all major pages at:

- 320px
- 375px
- 430px
- 768px
- 1024px
- 1280px
- 1440px
- 1920px

Check:

- Horizontal overflow
- Hidden controls
- Overlapping elements
- Dialog sizing
- Table behavior
- Navigation collapse
- Touch targets
- Form stacking
- Sticky elements
- Keyboard overlap
- Orientation changes
- Long translations
- Image scaling
- Content readability

Document each breakpoint defect with screenshots and reproduction steps where possible.

## 13\. Multilingual and RTL Review

Verify every supported language.

For Arabic:

- Apply true RTL at document level
- Mirror directional navigation
- Align dropdowns and modals correctly
- Use logical CSS properties
- Mirror directional icons only
- Preserve universal icons
- Use readable Arabic typography
- Test long translations
- Test mixed Arabic and English content
- Localize dates, numbers, currency, and plural forms

Identify all hard-coded user-visible text and missing translation keys.

## 14\. Light and Dark Mode Review

Review both themes separately.

Check:

- Color contrast
- Surface hierarchy
- Borders
- Text
- Inputs
- Tables
- Charts
- Modals
- Toasts
- Disabled states
- Focus indicators
- Images
- Logos
- Shadows
- Empty states
- Error states
- Theme persistence
- Theme flashing on startup

Do not approve dark mode if it is only a color inversion.

## 15\. Performance and Perceived Speed

Measure:

- Initial page load
- Route transitions
- Large table rendering
- Search and filter response
- Modal opening
- Form submission
- Image loading
- Editor responsiveness
- Viewer launch
- Skeleton and loading behavior

Identify:

- Large bundles
- Oversized images
- Unnecessary re-renders
- Blocking requests
- Duplicate requests
- Layout shifts
- Missing lazy loading
- Unclear long-running operations

Recommend improvements based on measured impact.

## 16\. Usability Testing

Create task-based usability scenarios for each major role.

For every scenario, record:

- Task
- User role
- Starting point
- Expected completion
- Time to completion
- Misclicks
- Backtracking
- Errors
- Assistance required
- User confusion
- Completion success

Prioritize testing high-frequency and high-risk tasks.

## 17\. Severity Classification

Classify every finding as:

- **Blocker** - prevents task completion or creates unacceptable user/safety risk
- **Critical** - likely to cause severe errors, data exposure, or dangerous actions
- **High** - major usability or accessibility barrier
- **Medium** - meaningful friction or inconsistency
- **Low** - minor polish issue
- **Informational** - recommendation or future enhancement

Do not classify purely cosmetic differences as high severity unless they materially affect usability.

## 18\. Finding Format

For every issue, provide:

- Title
- Severity
- Page or workflow
- User role
- Evidence
- Reproduction steps
- User impact
- Business impact
- Accessibility impact
- Recommended fix
- Suggested component or design-system change
- Verification method
- Screenshot reference where available

Clearly distinguish:

- Confirmed issue
- Design inconsistency
- Missing requirement
- Untested behavior
- Recommendation

## 19\. Prioritization

Prioritize fixes in this order:

1. Patient-safety or data-integrity risks
2. Actions users can perform incorrectly
3. Blocked workflows
4. Accessibility barriers
5. Authentication and permission confusion
6. Lost work or unsaved data
7. Navigation problems
8. Mobile and RTL defects
9. Performance friction
10. Visual inconsistency
11. Cosmetic polish

Avoid large redesigns that create new workflow risk unless clearly justified.

## 20\. Required Final Report

Produce:

### Executive Summary

- Overall UX quality
- Main user frustrations
- Highest-risk design issues
- Accessibility status
- Responsive status
- Localization status
- Recommended action

### UX Readiness Decision

Choose exactly one:

- **UX READY FOR PRODUCTION**
- **UX READY WITH ACCEPTED RISKS**
- **UX AND DESIGN GAPS REMAIN**

### Workflow Coverage

List each workflow reviewed and whether it was:

- Verified
- Partially verified
- Not verified

### Findings Summary

Provide totals by severity.

### Detailed Findings

Document all issues using the required finding format.

### Design-System Audit

Include:

- Inconsistencies
- Missing tokens
- Duplicate components
- Recommended standards

### Accessibility Report

Include:

- Automated findings
- Keyboard findings
- Screen-reader-oriented findings
- Contrast findings
- Remaining limitations

### Responsive Report

Include results by breakpoint.

### RTL and Localization Report

Include language-specific and layout-direction issues.

### Usability Improvements

Provide prioritized quick wins, medium-sized improvements, and larger redesign recommendations.

### Verification Plan

Define how every major fix should be retested.

## Final Instruction

Do not approve the system because it looks polished in screenshots.

Judge the experience by whether real users can complete important tasks accurately, quickly, confidently, accessibly, and without unnecessary risk.

Do not hide serious workflow defects behind cosmetic redesign work.

Where testing cannot be performed, state:

- What was not tested
- Why it was not tested
- What environment or users are required
- What risk remains