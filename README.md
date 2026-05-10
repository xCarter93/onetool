# OneTool

<div align="center">
  <img src="./apps/web/public/OneTool.png" alt="OneTool Logo" width="200" height="200" />
</div>

## Overview

OneTool is a lightweight, modern business management platform designed for small field-service businesses (cleaning, landscaping, HVAC, trades). Built with **clarity, speed, and essential workflows** in mind, OneTool helps you manage clients, projects, quotes, invoices, and tasks—all in one place.

## Key Features

### 👥 Client Management

- **Complete Client Profiles**: Track company information, industry, status, and notes
- **Status Workflow**: Lead → Prospect → Active → Inactive → Archived
- **Client Properties**: Manage multiple properties per client with addresses and details
- **Client Contacts**: Store multiple contacts per client with primary contact designation
- **Bulk Import**: Import clients from CSV files with AI-powered parsing
- **Smart Archiving**: Automatic cleanup of archived clients after 7 days

### 📁 Project Management

- **Full Lifecycle Tracking**: Plan, track progress, and complete projects
- **Status Management**: Planned → In-Progress → Completed → Cancelled
- **Project Types**: One-off or recurring projects
- **Team Assignment**: Assign salespeople and team members to projects
- **Date Tracking**: Start dates, end dates, and completion tracking
- **Client Linking**: Connect projects to clients for easy organization
- **Member Access Control**: Team members only see projects assigned to them

### 💰 Quote Management

- **Professional Quotes**: Create detailed quotes with line items, discounts, and taxes
- **PDF Generation**: Generate professional quote PDFs automatically
- **E-Signature Integration**: Send quotes for client approval via BoldSign
- **Status Tracking**: Draft → Sent → Approved → Declined → Expired
- **Sequential Numbering**: Auto-generated quote numbers (Q-000001)
- **Public Access**: Clients can view and approve quotes via secure public URLs
- **Quote to Invoice**: Convert approved quotes to invoices with one click

### 💳 Invoice & Payments

- **Invoice Creation**: Create invoices manually or from approved quotes
- **PDF Generation**: Professional invoice PDFs with your branding
- **Payment Processing**: Stripe Checkout integration for secure payments
- **Status Tracking**: Draft → Sent → Paid → Overdue → Cancelled
- **Public Payment Page**: Clients can pay invoices via secure public URLs
- **Stripe Connect**: Direct payments to your organization's Stripe account
- **Automatic Totals**: Calculated from line items with discounts and taxes

### ✅ Task Scheduling

- **Task Creation**: Create tasks with dates, times, and assignments
- **Recurring Tasks**: Set up daily, weekly, monthly, or yearly recurring tasks
- **Status Tracking**: Pending → In-Progress → Completed → Cancelled
- **Priority Levels**: Low, Medium, High, Urgent
- **Calendar View**: Full calendar integration with task display
- **Project & Client Linking**: Link tasks to projects and clients
- **Team Assignment**: Assign tasks to team members

### 📧 Email Communication

- **Client Emails**: Send branded emails to clients via Resend
- **Email Threading**: Reply-to functionality with thread tracking
- **Organization Branding**: Custom email templates with your logo and colors
- **Inbound Email**: Receive and process client emails automatically
- **Email Tracking**: Track sent, delivered, opened, bounced, and complaint status
- **Attachments**: Send file attachments with emails
- **Unique Addresses**: Each organization gets a unique receiving email address

### 🔔 Notifications & Mentions

- **In-App Notifications**: Real-time notifications for important events
- **Mention System**: Tag team members in client, project, or quote contexts
- **Notification Types**: Task reminders, quote approvals, invoice overdue alerts, and more
- **Read/Unread Tracking**: Keep track of which notifications you've seen
- **Priority Levels**: Low, Medium, High, Urgent notifications
- **Scheduled Notifications**: Set up future-dated notifications

### ✍️ E-Signatures

- **BoldSign Integration**: Send documents for e-signature seamlessly
- **Status Tracking**: Sent → Viewed → Signed → Completed
- **Real-Time Updates**: Get instant notifications when documents are signed
- **Signed PDF Storage**: Download and store signed documents automatically
- **Quote Approval**: Automatic quote status update when signature is completed
- **Usage Tracking**: Track monthly e-signature count for plan limits

### 🏢 Organization Management

- **Organization Profile**: Manage company information and branding
- **Logo Management**: Upload and manage your organization logo
- **Brand Customization**: Customize brand colors and contact information
- **Document Library**: Store reusable organization documents
- **SKU Management**: Create reusable products/services for quotes
- **Stripe Connect**: Set up payment processing for your organization
- **Email Configuration**: Configure receiving email addresses
- **Settings**: Default tax rate, reminder timing, timezone, and more

### 📊 Dashboard & Analytics

- **Home Dashboard**: Overview of key business metrics at a glance
- **Calendar View**: Alternative dashboard view with calendar integration
- **Business Stats**: Track clients, projects, quotes, invoices, revenue, and tasks
- **Date Range Filtering**: Analyze performance over custom date ranges
- **Trend Charts**: Visualize growth over time with line charts
- **Revenue Goal Tracking**: Set and track monthly revenue goals
- **Activity Feed**: See recent activity across your organization
- **Getting Started**: Onboarding checklist for new users

### 📱 Mobile App

- **Native iOS App**: Full-featured mobile app for iPhone and iPad
- **Real-Time Sync**: Changes sync instantly between web and mobile
- **Full Feature Parity**: Access all features from your mobile device
- **Offline Support**: Data persists locally and syncs when online
- **Native Navigation**: iOS-style navigation with smooth transitions
- **Organization Switching**: Switch between organizations on the go
- **Push Notifications**: Get notified about important events (coming soon)

### 🎯 Product Tours & Onboarding

- **Guided Tours**: Interactive multi-step tours for new users
- **Home Tour**: Comprehensive 9-step tour covering key features
- **Keyboard Navigation**: Navigate tours with arrow keys and Enter
- **Progress Tracking**: Visual progress indicators
- **Tour Persistence**: Tours remember completion status

### 📥 Data Import

- **CSV Import**: Bulk import clients and projects from CSV files
- **AI-Powered Parsing**: Intelligent CSV analysis with Mastra agent
- **Data Validation**: Automatic field validation and error reporting
- **Client Name Resolution**: Automatically match client names to existing clients

## Platform Availability

- **Web App**: Full-featured web application accessible from any browser
- **Mobile App**: Native iOS app for iPhone and iPad (Android coming soon)

## Tech Stack

OneTool is built with modern, reliable technologies:

- **Frontend**: Next.js with React and Tailwind CSS
- **Backend**: Convex (real-time database and functions)
- **Authentication**: Clerk (users + organizations)
- **Payments**: Stripe Checkout + Stripe Connect
- **Email**: Resend
- **E-Signatures**: BoldSign
- **Mobile**: React Native with Expo

## Getting Started

1. **Sign Up**: Create your account and set up your organization
2. **Add Clients**: Import clients or add them manually
3. **Create Projects**: Link projects to clients and track progress
4. **Send Quotes**: Create professional quotes and send for approval
5. **Invoice & Get Paid**: Convert approved quotes to invoices and get paid via Stripe
6. **Schedule Tasks**: Create tasks and set up recurring schedules
7. **Track Performance**: Monitor your business metrics on the dashboard

## Plans & Pricing

### Free Plan

- 10 clients max
- 3 active projects per client
- 5 e-signatures per month
- Custom PDF generation

### Business Plan

- Unlimited clients
- Unlimited projects
- Unlimited e-signatures
- Custom SKUs
- Unlimited documents
- AI import
- Stripe Connect
- Priority support

## Security & Privacy

- **Multi-Tenant Architecture**: Your data is completely isolated by organization
- **Secure Authentication**: Powered by Clerk with industry-standard security
- **Encrypted Storage**: All data encrypted at rest and in transit
- **GDPR Compliant**: Data privacy and security are top priorities

## Support

For questions, issues, or feature requests, please contact our support team.

---

**OneTool** - Simplify your growing business
