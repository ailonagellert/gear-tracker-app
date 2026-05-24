# Copilot Instructions for Gear Tracker App

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

## Project Overview
This is a modern bike maintenance tracking application built with Next.js 15, TypeScript, and Tailwind CSS. The app provides intelligent maintenance scheduling, Strava integration, and real-time tracking of bike components.

## Architecture Guidelines
- Use Next.js App Router with TypeScript
- Implement server components by default, client components when needed
- Use Tailwind CSS for styling with component-based design
- Follow the repository pattern for data access
- Implement proper error boundaries and loading states

## Code Standards
- Use TypeScript with strict mode enabled
- Follow functional programming patterns where possible
- Implement proper type safety throughout the application
- Use ESLint and Prettier for code formatting
- Write descriptive component names and clear interfaces

## File Structure
- `/src/app` - Next.js app router pages and layouts
- `/src/components` - Reusable UI components
- `/src/lib` - Utility functions and configurations
- `/src/types` - TypeScript type definitions
- `/src/stores` - State management (Zustand)
- `/src/services` - API and external service integrations

## Key Features to Implement
1. **Authentication**: NextAuth.js integration
2. **Strava Integration**: OAuth and activity sync
3. **Bike Management**: CRUD operations for bikes and components
4. **Maintenance Tracking**: Smart scheduling and reminders
5. **Real-time Updates**: WebSocket integration
6. **PWA Support**: Service workers and offline functionality
7. **Analytics Dashboard**: Charts and performance metrics

## Component Guidelines
- Use shadcn/ui components when possible
- Implement proper loading and error states
- Ensure accessibility (ARIA labels, keyboard navigation)
- Design mobile-first responsive layouts
- Use semantic HTML elements

## API Design
- Use tRPC for type-safe API calls
- Implement proper validation with Zod
- Use React Query for data fetching and caching
- Follow RESTful principles for external APIs
- Implement rate limiting and error handling

## State Management
- Use Zustand for global state
- Implement proper state persistence
- Use React Query for server state
- Minimize client state when possible

## Testing Strategy
- Write unit tests for utility functions
- Implement component testing with React Testing Library
- Use E2E tests for critical user flows
- Mock external API calls in tests

## Performance Considerations
- Use Next.js image optimization
- Implement proper code splitting
- Use React.memo for expensive components
- Optimize bundle size with tree shaking
- Implement proper caching strategies
