# RCMS Frontend

This directory contains the React.js frontend for the Radiology Center Management System.

## Project Structure

```
src/
├── components/
│   ├── dashboard/       # Dashboard widgets (charts, calendar)
│   ├── forms/           # Reusable form components with Zod validation
│   └── ui/              # Base UI components (Buttons, Cards - Tailwind)
├── pages/
│   ├── Login.jsx        # Auth Page
│   ├── Reception.jsx    # Receptionist Workflow
│   ├── Doctor.jsx       # Radiologist Workflow
│   └── Admin.jsx        # Analytics & Management
├── store/
│   ├── authSlice.js     # Redux Auth state
│   └── api.js           # RTK Query endpoints
└── App.jsx              # Main Router
```

## Getting Started

1. `npm install`
2. Copy `.env.example` to `.env`
3. `npm run dev`

## Key Libraries
- **React Router**: Navigation
- **Redux Toolkit**: State Management
- **Tailwind CSS**: Styling
- **Recharts**: Analytics Charts
- **React-Hook-Form + Zod**: Form Validation
