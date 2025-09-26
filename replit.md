# NutriMa - AI-Powered Meal Planning Platform

This project is an AI-powered meal planning platform built with React + TypeScript frontend and Express backend.

## Overview
- **Purpose**: AI-powered meal planning with cultural cuisine integration
- **Tech Stack**: React, TypeScript, Express, PostgreSQL, Vite
- **Status**: Successfully imported and configured for Replit environment

## Recent Changes (September 26, 2025)
- Imported from GitHub repository  
- Fixed Vite configuration for Replit proxy support (allowedHosts: "all")
- Made OpenAI and Stripe API integrations conditional for graceful degradation
- Configured development environment with NODE_ENV=development
- Set up PostgreSQL database with schema migrations
- Configured deployment settings for autoscale deployment

## Project Architecture
- **Frontend**: React with Vite development server on port 5000
- **Backend**: Express.js with integrated Vite proxy
- **Database**: PostgreSQL with Drizzle ORM
- **AI Features**: OpenAI GPT-4 integration (requires API key)
- **Payments**: Stripe integration (optional, requires API key)

## Environment Configuration
The application runs with conditional API integrations:
- Database: ✅ Configured and working
- OpenAI API: ⚠️ Optional (requires OPENAI_API_KEY for AI features)  
- Stripe: ⚠️ Optional (requires STRIPE_SECRET_KEY for payments)
- Other APIs: Various optional keys for enhanced features

## Development Workflow
- Main development command: `NODE_ENV=development npm run dev`
- Serves both API and frontend on port 5000
- Hot reload enabled via Vite HMR
- Database migrations: `npm run db:push`

## Deployment
- Target: Autoscale deployment
- Build: `npm run build`  
- Start: `npm run start`
- Suitable for stateless web application deployment