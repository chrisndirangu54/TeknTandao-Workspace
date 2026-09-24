import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

class CountryAdapter {
  final String code;
  final String name;
  final String currencyCode;
  final String currencySymbol;
  final String taxAuthorityName;
  final String taxSystemName;
  final double defaultVatRate;
  final String idFormatHint;

  const CountryAdapter({
    required this.code,
    required this.name,
    required this.currencyCode,
    required this.currencySymbol,
    required this.taxAuthorityName,
    required this.taxSystemName,
    required this.defaultVatRate,
    required this.idFormatHint,
  });
}

const List<CountryAdapter> supportedCountries = [
  CountryAdapter(
    code: 'KE',
    name: 'Kenya',
    currencyCode: 'KES',
    currencySymbol: 'KES',
    taxAuthorityName: 'Kenya Revenue Authority (KRA)',
    taxSystemName: 'eTIMS (OSCU / VSCU)',
    defaultVatRate: 0.16,
    idFormatHint: 'KRA PIN: P051928471Z',
  ),
  CountryAdapter(
    code: 'NG',
    name: 'Nigeria',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    taxAuthorityName: 'Federal Inland Revenue Service (FIRS)',
    taxSystemName: 'FIRS E-Invoicing',
    defaultVatRate: 0.075,
    idFormatHint: 'TIN: 12345678-0001',
  ),
  CountryAdapter(
    code: 'GH',
    name: 'Ghana',
    currencyCode: 'GHS',
    currencySymbol: 'GH₵',
    taxAuthorityName: 'Ghana Revenue Authority (GRA)',
    taxSystemName: 'E-VAT Fiscal System',
    defaultVatRate: 0.15,
    idFormatHint: 'TIN: C000123456X',
  ),
  CountryAdapter(
    code: 'ZA',
    name: 'South Africa',
    currencyCode: 'ZAR',
    currencySymbol: 'R',
    taxAuthorityName: 'South African Revenue Service (SARS)',
    taxSystemName: 'SARS eFiling VAT',
    defaultVatRate: 0.15,
    idFormatHint: 'VAT Ref: 4000123456',
  ),
];

class ModuleDependency {
  final String targetModuleId;
  final String relationDescription;
  final bool isRequired;

  const ModuleDependency({
    required this.targetModuleId,
    required this.relationDescription,
    this.isRequired = false,
  });
}

class SuiteModule {
  final String id;
  final String name;
  final String description;
  final IconData icon;
  final Color color;
  final String category;
  final int monthlyPriceKes;
  final List<ModuleDependency> dependencies;
  final List<String> publishedEvents;

  const SuiteModule({
    required this.id,
    required this.name,
    required this.description,
    required this.icon,
    required this.color,
    required this.category,
    required this.monthlyPriceKes,
    this.dependencies = const [],
    this.publishedEvents = const [],
  });
}

const List<SuiteModule> modules = [
  // 1. Sales & Marketing
  SuiteModule(
    id: 'crm',
    name: 'Sales & CRM',
    description: 'Leads, Deals Pipeline, Customer Journeys & WhatsApp Messaging',
    icon: Icons.people_alt_rounded,
    color: Color(0xFF3B82F6),
    category: 'Sales & Marketing',
    monthlyPriceKes: 150000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Converts won deals directly into Accounting invoices & customer ledger entries.',
      ),
      ModuleDependency(
        targetModuleId: 'inventory',
        relationDescription: 'Reserves inventory stock when sales quotations are accepted.',
      ),
    ],
    publishedEvents: ['lead.created', 'deal.won', 'quote.accepted'],
  ),
  SuiteModule(
    id: 'marketing',
    name: 'Marketing Automation',
    description: 'Email, SMS & WhatsApp Campaigns, Lead Scoring & Journeys',
    icon: Icons.campaign_rounded,
    color: Color(0xFF805AD5),
    category: 'Sales & Marketing',
    monthlyPriceKes: 130000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'crm',
        relationDescription: 'Uses shared customer segments and lead contact profiles.',
      ),
    ],
    publishedEvents: ['campaign.sent', 'lead.scored'],
  ),
  SuiteModule(
    id: 'bookings',
    name: 'Bookings & Scheduling',
    description: 'Online Client Appointment Booking, Calendar & Reminder SMS',
    icon: Icons.calendar_month_rounded,
    color: Color(0xFF0284C7),
    category: 'Sales & Marketing',
    monthlyPriceKes: 110000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'payments',
        relationDescription: 'Collects booking deposit payments via M-Pesa STK Push.',
      ),
    ],
    publishedEvents: ['appointment.booked', 'reminder.sent'],
  ),
  SuiteModule(
    id: 'ecommerce',
    name: 'E-Commerce Storefront',
    description: 'Online Digital Shop, Cart, Mobile Payments & Order Dispatch',
    icon: Icons.shopping_bag_rounded,
    color: Color(0xFFD97706),
    category: 'Sales & Marketing',
    monthlyPriceKes: 170000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'inventory',
        relationDescription: 'Displays live catalog stock & reserves items on checkout.',
      ),
      ModuleDependency(
        targetModuleId: 'payments',
        relationDescription: 'Accepts M-Pesa & Paystack online order checkout.',
      ),
    ],
    publishedEvents: ['order.placed', 'checkout.completed'],
  ),
  SuiteModule(
    id: 'social',
    name: 'Social Media Management',
    description: 'Post Scheduler (LinkedIn, Twitter/X, Meta), Brand Listening & Reach Analytics',
    icon: Icons.share_rounded,
    color: Color(0xFFEC4899),
    category: 'Sales & Marketing',
    monthlyPriceKes: 120000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'crm',
        relationDescription: 'Captures social media comments as fresh sales leads.',
      ),
    ],
    publishedEvents: ['post.published', 'social.lead_captured'],
  ),
  SuiteModule(
    id: 'livechat',
    name: 'Live Chat & AI Bot',
    description: 'Website Live Chat Widget, AI Bot Auto-responder & WhatsApp Bot',
    icon: Icons.chat_bubble_rounded,
    color: Color(0xFF10B981),
    category: 'Sales & Marketing',
    monthlyPriceKes: 115000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'helpdesk',
        relationDescription: 'Escalates unanswered chat sessions into helpdesk tickets.',
      ),
    ],
    publishedEvents: ['chat.session_started', 'chat.escalated'],
  ),
  SuiteModule(
    id: 'events',
    name: 'Event Management',
    description: 'Conference Ticketing, QR Code Passes, Speaker Schedules & Check-in',
    icon: Icons.event_rounded,
    color: Color(0xFFF59E0B),
    category: 'Sales & Marketing',
    monthlyPriceKes: 140000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'payments',
        relationDescription: 'Collects event ticket sales via M-Pesa & Card payments.',
      ),
    ],
    publishedEvents: ['event.ticket_issued', 'attendee.checked_in'],
  ),
  SuiteModule(
    id: 'surveys',
    name: 'Forms & Customer Surveys',
    description: 'Custom Drag-and-Drop Form Builder, Feedback Surveys & NPS Scoring',
    icon: Icons.assignment_turned_in_rounded,
    color: Color(0xFF6366F1),
    category: 'Sales & Marketing',
    monthlyPriceKes: 95000,
    publishedEvents: ['form.submitted', 'survey.completed'],
  ),

  // 2. Retail, Supply Chain & Operations
  SuiteModule(
    id: 'pos',
    name: 'Point of Sale',
    description: 'Retail & Multi-branch Cash Register, Thermal Receipts & Barcodes',
    icon: Icons.point_of_sale_rounded,
    color: Color(0xFF10B981),
    category: 'Retail & Sales',
    monthlyPriceKes: 180000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'inventory',
        relationDescription: 'Deducts stock levels immediately upon receipt authorization.',
        isRequired: true,
      ),
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Posts daily sales & payment tenders to general ledger.',
      ),
      ModuleDependency(
        targetModuleId: 'etims',
        relationDescription: 'Submits completed sales receipts to KRA eTIMS for tax compliance.',
      ),
    ],
    publishedEvents: ['sale.completed', 'cashier.shift_closed', 'refund.processed'],
  ),
  SuiteModule(
    id: 'inventory',
    name: 'Inventory & Warehousing',
    description: 'Multi-Warehouse SKUs, Reorder Levels, Batches & Supplier POs',
    icon: Icons.inventory_2_rounded,
    color: Color(0xFFF59E0B),
    category: 'Supply Chain',
    monthlyPriceKes: 120000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Updates inventory valuation accounts on stock adjustment or purchase.',
      ),
    ],
    publishedEvents: ['stock.low', 'stock.received', 'sku.created'],
  ),
  SuiteModule(
    id: 'procurement',
    name: 'Procurement & Purchasing',
    description: 'Supplier RFQs, Purchase Orders, Goods Received Notes & Vendor Bills',
    icon: Icons.local_shipping_rounded,
    color: Color(0xFF2563EB),
    category: 'Supply Chain',
    monthlyPriceKes: 140000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'inventory',
        relationDescription: 'Increases warehouse stock upon Goods Received authorization.',
      ),
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Posts vendor bills to Accounts Payable ledger.',
      ),
    ],
    publishedEvents: ['po.issued', 'grn.received'],
  ),
  SuiteModule(
    id: 'manufacturing',
    name: 'Manufacturing & MRP',
    description: 'Bill of Materials (BOM), Work Orders, Assembly & Production Costing',
    icon: Icons.precision_manufacturing_rounded,
    color: Color(0xFF4B5563),
    category: 'Supply Chain',
    monthlyPriceKes: 220000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'inventory',
        relationDescription: 'Consumes raw materials and produces finished SKU inventory.',
      ),
    ],
    publishedEvents: ['workorder.started', 'production.completed'],
  ),
  SuiteModule(
    id: 'wms',
    name: 'Barcode WMS & Picking',
    description: 'Mobile Barcode Scanner, Bin Locations, Pick/Pack/Ship Workflows',
    icon: Icons.qr_code_scanner_rounded,
    color: Color(0xFF0D9488),
    category: 'Supply Chain',
    monthlyPriceKes: 155000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'inventory',
        relationDescription: 'Updates physical bin rack locations and stock counts.',
      ),
    ],
    publishedEvents: ['batch.picked', 'shipment.dispatched'],
  ),
  SuiteModule(
    id: 'quality',
    name: 'Quality Control',
    description: 'Quality Control Checks, Non-Conformance Reports (NCR) & Inspection Passes',
    icon: Icons.verified_outlined,
    color: Color(0xFF059669),
    category: 'Supply Chain',
    monthlyPriceKes: 125000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'manufacturing',
        relationDescription: 'Performs quality audit on completed work order batches.',
      ),
    ],
    publishedEvents: ['quality.inspected', 'ncr.flagged'],
  ),
  SuiteModule(
    id: 'fieldservice',
    name: 'Field Service Management',
    description: 'Dispatch Technicians, Service Appointments, Maintenance Schedules & GPS',
    icon: Icons.handyman_rounded,
    color: Color(0xFFEA580C),
    category: 'Operations',
    monthlyPriceKes: 150000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'hr',
        relationDescription: 'Schedules field technicians and logs billable work hours.',
      ),
    ],
    publishedEvents: ['dispatch.created', 'service.completed'],
  ),
  SuiteModule(
    id: 'fleet',
    name: 'Fleet & Vehicle Logistics',
    description: 'Vehicle Tracking, Fuel Logs, Maintenance Reminders & Trip Route Costing',
    icon: Icons.directions_car_rounded,
    color: Color(0xFF0369A1),
    category: 'Operations',
    monthlyPriceKes: 160000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Posts vehicle fuel and repair costs to expense accounts.',
      ),
    ],
    publishedEvents: ['trip.started', 'maintenance.due'],
  ),

  // 3. Finance, Compliance & Payments
  SuiteModule(
    id: 'accounting',
    name: 'Books & Financials',
    description: 'General Ledger, Invoices, Double-entry Bookkeeping & Expenses',
    icon: Icons.receipt_long_rounded,
    color: Color(0xFF8B5CF6),
    category: 'Finance',
    monthlyPriceKes: 220000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'etims',
        relationDescription: 'Routes signed tax invoices directly to Kenya Revenue Authority (KRA).',
      ),
    ],
    publishedEvents: ['invoice.created', 'payment.reconciled', 'journal.posted'],
  ),
  SuiteModule(
    id: 'expenses',
    name: 'Expense Management',
    description: 'Employee Expense Claims, Receipt OCR Scanner & Approval Workflows',
    icon: Icons.account_balance_wallet_rounded,
    color: Color(0xFFD97706),
    category: 'Finance',
    monthlyPriceKes: 110000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Posts approved employee expenses directly to accounts payable ledger.',
      ),
    ],
    publishedEvents: ['expense.submitted', 'expense.approved'],
  ),
  SuiteModule(
    id: 'subscriptions',
    name: 'Subscription Billing',
    description: 'Recurring Contracts, Automated Retainers, Dunning & Renewal Reminders',
    icon: Icons.autorenew_rounded,
    color: Color(0xFF2563EB),
    category: 'Finance',
    monthlyPriceKes: 145000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'payments',
        relationDescription: 'Auto-debits recurring monthly subscriptions via M-Pesa & Card.',
      ),
    ],
    publishedEvents: ['subscription.renewed', 'subscription.cancelled'],
  ),
  SuiteModule(
    id: 'assets',
    name: 'Fixed Asset Register',
    description: 'Fixed Assets, Depreciation Schedules, Asset Transfers & Preventive Maintenance',
    icon: Icons.build_circle_rounded,
    color: Color(0xFF475569),
    category: 'Finance',
    monthlyPriceKes: 130000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Posts monthly asset depreciation journal entries to general ledger.',
      ),
    ],
    publishedEvents: ['asset.registered', 'depreciation.calculated'],
  ),
  SuiteModule(
    id: 'payments',
    name: 'M-Pesa & Paystack Hub',
    description: 'STK Push, C2B Merchant Reconciliation, Paystack Gateway & Cards',
    icon: Icons.payments_rounded,
    color: Color(0xFF16A34A),
    category: 'Payments',
    monthlyPriceKes: 90000,
    publishedEvents: ['mpesa.stk_success', 'payment.verified'],
  ),
  SuiteModule(
    id: 'etims',
    name: 'Kenya KRA eTIMS',
    description: 'Official OSCU/VSCU Fiscalization, QR Generation & Compliance Audit',
    icon: Icons.verified_user_rounded,
    color: Color(0xFF059669),
    category: 'Compliance',
    monthlyPriceKes: 100000,
    publishedEvents: ['etims.invoice_submitted', 'etims.signature_verified'],
  ),

  // 4. Human Resources & Productivity
  SuiteModule(
    id: 'hr',
    name: 'People & Attendance',
    description: 'Staff Directory, GPS Clock-in/out, Leave Requests & Organizational Chart',
    icon: Icons.badge_rounded,
    color: Color(0xFFEC4899),
    category: 'Human Resources',
    monthlyPriceKes: 200000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'payroll',
        relationDescription: 'Pushes verified attendance hours & leave days to monthly payroll.',
      ),
    ],
    publishedEvents: ['employee.clock_in', 'leave.approved'],
  ),
  SuiteModule(
    id: 'payroll',
    name: 'Statutory Payroll Hub',
    description: 'PAYE, NSSF, SHA / NHIF, Housing Levy Tax Returns & Net Pay Disbursal',
    icon: Icons.request_quote_rounded,
    color: Color(0xFF16A34A),
    category: 'Human Resources',
    monthlyPriceKes: 210000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Posts payroll expense journals and statutory tax liabilities.',
      ),
      ModuleDependency(
        targetModuleId: 'payments',
        relationDescription: 'Disburses staff salaries via M-Pesa B2C batch disbursement.',
      ),
    ],
    publishedEvents: ['payroll.processed', 'salary.disbursed'],
  ),
  SuiteModule(
    id: 'recruitment',
    name: 'Recruitment & ATS',
    description: 'Job Openings, Candidate Pipeline, Resume Parser & Interview Schedules',
    icon: Icons.person_search_rounded,
    color: Color(0xFF9333EA),
    category: 'Human Resources',
    monthlyPriceKes: 135000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'hr',
        relationDescription: 'Converts hired job candidates directly into employee profiles.',
      ),
    ],
    publishedEvents: ['job.posted', 'candidate.hired'],
  ),
  SuiteModule(
    id: 'lms',
    name: 'Learning & Staff LMS',
    description: 'Employee Onboarding Courses, Skill Training Videos & Compliance Certifications',
    icon: Icons.school_outlined,
    color: Color(0xFF0284C7),
    category: 'Human Resources',
    monthlyPriceKes: 110000,
    publishedEvents: ['course.completed', 'certification.issued'],
  ),
  SuiteModule(
    id: 'projects',
    name: 'Projects & Work',
    description: 'Kanban Tasks, Gantt Milestones, Timesheets & Client Billing',
    icon: Icons.assignment_rounded,
    color: Color(0xFF6366F1),
    category: 'Operations',
    monthlyPriceKes: 160000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'crm',
        relationDescription: 'Links project milestones directly to client account contracts.',
      ),
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Bills project time and expenses directly to customer invoices.',
      ),
    ],
    publishedEvents: ['project.created', 'task.completed', 'milestone.reached'],
  ),
  SuiteModule(
    id: 'helpdesk',
    name: 'Customer Desk',
    description: 'Omnichannel Tickets, WhatsApp Support, SLAs & Knowledge Base',
    icon: Icons.support_agent_rounded,
    color: Color(0xFF0284C7),
    category: 'Customer Service',
    monthlyPriceKes: 140000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'crm',
        relationDescription: 'Links support tickets to customer history profiles.',
      ),
    ],
    publishedEvents: ['ticket.created', 'ticket.resolved', 'sla.breached'],
  ),
  SuiteModule(
    id: 'documents',
    name: 'WorkDrive & Digital Signatures',
    description: 'Cloud File Vault, Document Templates & Legal e-Signatures',
    icon: Icons.drive_file_rename_outline_rounded,
    color: Color(0xFF059669),
    category: 'Productivity',
    monthlyPriceKes: 100000,
    publishedEvents: ['document.uploaded', 'signature.completed'],
  ),
  SuiteModule(
    id: 'knowledge',
    name: 'Knowledge Base & SOPs',
    description: 'Internal Company Wiki, Standard Operating Procedures & Employee Handbook',
    icon: Icons.menu_book_rounded,
    color: Color(0xFFEA580C),
    category: 'Productivity',
    monthlyPriceKes: 85000,
    publishedEvents: ['article.published', 'sop.updated'],
  ),
  SuiteModule(
    id: 'contracts',
    name: 'Contracts Management',
    description: 'Contract Lifecycle, Renewal Tracking, Legal Templates & E-signatures',
    icon: Icons.description_rounded,
    color: Color(0xFF475569),
    category: 'Productivity',
    monthlyPriceKes: 125000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'documents',
        relationDescription: 'Stores signed legally binding contract PDFs in WorkDrive.',
      ),
    ],
    publishedEvents: ['contract.created', 'contract.signed'],
  ),
  SuiteModule(
    id: 'discussions',
    name: 'Team Chat & Channels',
    description: 'Internal Channels, Direct Messages, Voice Notes & File Sharing',
    icon: Icons.forum_rounded,
    color: Color(0xFF805AD5),
    category: 'Productivity',
    monthlyPriceKes: 90000,
    publishedEvents: ['message.posted', 'channel.created'],
  ),
  SuiteModule(
    id: 'analytics',
    name: 'Analytics & BI Hub',
    description: 'Custom SQL/Visual Dashboards, Data Connectors & AI Predictive Insights',
    icon: Icons.bar_chart_rounded,
    color: Color(0xFF3B82F6),
    category: 'Productivity',
    monthlyPriceKes: 175000,
    publishedEvents: ['dashboard.created', 'report.exported'],
  ),
  SuiteModule(
    id: 'vault',
    name: 'Secret Vault & Passwords',
    description: 'Secure Enterprise Password Vault, API Secret Keys & Multi-User Sharing',
    icon: Icons.lock_rounded,
    color: Color(0xFF0F172A),
    category: 'Productivity',
    monthlyPriceKes: 80000,
    publishedEvents: ['secret.stored', 'vault.accessed'],
  ),
  SuiteModule(
    id: 'desk_phone',
    name: 'Cloud PBX & Call Center',
    description: 'Virtual Business Numbers, Call Center Queues & Call Recording Logs',
    icon: Icons.phone_in_talk_rounded,
    color: Color(0xFF0284C7),
    category: 'Productivity',
    monthlyPriceKes: 150000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'crm',
        relationDescription: 'Pops client CRM record card automatically on incoming phone call.',
      ),
    ],
    publishedEvents: ['call.answered', 'call.recorded'],
  ),

  // 5. African & Specialized Industry Verticals
  SuiteModule(
    id: 'property',
    name: 'Property & Real Estate',
    description: 'Tenant Leases, Rent Collection via M-Pesa, Unit Vacancies & Maintenance',
    icon: Icons.apartment_rounded,
    color: Color(0xFF0D9488),
    category: 'Property & Hospitality',
    monthlyPriceKes: 250000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'payments',
        relationDescription: 'Reconciles tenant monthly rent payments via M-Pesa Paybill.',
      ),
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Posts property rental income and maintenance expense journals.',
      ),
    ],
    publishedEvents: ['rent.due', 'lease.signed', 'tenant.payment_received'],
  ),
  SuiteModule(
    id: 'sacco',
    name: 'SACCO & Cooperative Hub',
    description: 'Member Shares, Loan Applications, Interest Calculation & Dividends',
    icon: Icons.account_balance_rounded,
    color: Color(0xFF15803D),
    category: 'Financial Services',
    monthlyPriceKes: 300000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'payments',
        relationDescription: 'Disburses instant approved loan amounts via M-Pesa B2C API.',
      ),
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Posts member deposits and loan interest income to general ledger.',
      ),
    ],
    publishedEvents: ['loan.applied', 'loan.disbursed', 'share.deposited'],
  ),
  SuiteModule(
    id: 'hotel',
    name: 'Hotel & Hospitality',
    description: 'Room Reservations, Guest Check-in/out, Housekeeping & Folio Billing',
    icon: Icons.hotel_rounded,
    color: Color(0xFFBE185D),
    category: 'Property & Hospitality',
    monthlyPriceKes: 280000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'payments',
        relationDescription: 'Accepts card and mobile payments for guest folios.',
      ),
    ],
    publishedEvents: ['room.reserved', 'guest.checked_in'],
  ),
  SuiteModule(
    id: 'restaurant',
    name: 'Restaurant & Bar POS',
    description: 'Kitchen Display System (KDS), Table Layout, Split Bills & Bar Orders',
    icon: Icons.restaurant_rounded,
    color: Color(0xFFC05621),
    category: 'Property & Hospitality',
    monthlyPriceKes: 190000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'inventory',
        relationDescription: 'Deducts kitchen ingredient recipe stock per order.',
      ),
    ],
    publishedEvents: ['order.sent_to_kitchen', 'bill.settled'],
  ),
  SuiteModule(
    id: 'ngo',
    name: 'NGO & Grants Management',
    description: 'Donor Fund Allocation, Grant Budgets, Beneficiary Tracking & Audits',
    icon: Icons.volunteer_activism_rounded,
    color: Color(0xFF7E22CE),
    category: 'Non-Profit',
    monthlyPriceKes: 220000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Tracks donor-restricted fund accounts and grant expenditures.',
      ),
    ],
    publishedEvents: ['grant.received', 'disbursement.approved'],
  ),
  SuiteModule(
    id: 'hospital',
    name: 'Hospital & Clinic',
    description: 'Patient Records, Clinical Notes, Prescriptions & Medical Billing',
    icon: Icons.local_hospital_rounded,
    color: Color(0xFFEF4444),
    category: 'Healthcare',
    monthlyPriceKes: 450000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'inventory',
        relationDescription: 'Tracks hospital pharmacy drug dispensation & stock.',
      ),
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Generates medical bills & insurance claims.',
      ),
    ],
    publishedEvents: ['patient.registered', 'prescription.issued', 'consultation.completed'],
  ),
  SuiteModule(
    id: 'school',
    name: 'School Management',
    description: 'Student Records, Guardians, Fee Collection, Grades & Timetables',
    icon: Icons.school_rounded,
    color: Color(0xFF06B6D4),
    category: 'Education',
    monthlyPriceKes: 350000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Posts school fee payments and student ledger balances.',
      ),
      ModuleDependency(
        targetModuleId: 'hr',
        relationDescription: 'Links teacher assignments and staff schedules.',
      ),
    ],
    publishedEvents: ['student.enrolled', 'fee.paid', 'reportcard.generated'],
  ),
  SuiteModule(
    id: 'agri',
    name: 'Agriculture & Outgrowers',
    description: 'Crop Seasons, Farmer Outgrower Aggregation, Produce Weighing & Produce Payouts',
    icon: Icons.agriculture_rounded,
    color: Color(0xFF15803D),
    category: 'Agriculture',
    monthlyPriceKes: 240000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'payments',
        relationDescription: 'Pays outgrower farmers instantly via bulk M-Pesa B2C.',
      ),
    ],
    publishedEvents: ['crop.harvested', 'produce.weighed', 'payout.processed'],
  ),
  SuiteModule(
    id: 'freight',
    name: 'Cargo Freight & Customs',
    description: 'Bills of Lading, Container Shipping Tracking, Customs Clearance & Port Handling',
    icon: Icons.directions_boat_rounded,
    color: Color(0xFF0284C7),
    category: 'Logistics',
    monthlyPriceKes: 290000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'fleet',
        relationDescription: 'Hands off cleared container cargo to overland transport fleet.',
      ),
    ],
    publishedEvents: ['shipment.received_at_port', 'customs.cleared'],
  ),
  SuiteModule(
    id: 'legal',
    name: 'Legal Practice & Cases',
    description: 'Court Case Dockets, Hearing Dates, Billable Time Retainers & Legal Briefs',
    icon: Icons.gavel_rounded,
    color: Color(0xFF475569),
    category: 'Professional Services',
    monthlyPriceKes: 210000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'accounting',
        relationDescription: 'Invoices client billable litigation hours and retainer accounts.',
      ),
    ],
    publishedEvents: ['case.filed', 'hearing.scheduled'],
  ),
  SuiteModule(
    id: 'ework',
    name: 'EWork',
    description: 'Workflow gaps, freelancer briefs, matches, and accepted milestones',
    icon: Icons.groups_rounded,
    color: Color(0xFF0F766E),
    category: 'Projects, Work & Collaboration',
    monthlyPriceKes: 160000,
    publishedEvents: ['ework.engagement_approved'],
  ),
  SuiteModule(
    id: 'microfinance',
    name: 'Microfinance & Credit Scoring',
    description: 'Micro-loan Origination, Automated Credit Bureau Check, Collateral & Collections',
    icon: Icons.savings_rounded,
    color: Color(0xFF16A34A),
    category: 'Financial Services',
    monthlyPriceKes: 320000,
    dependencies: [
      ModuleDependency(
        targetModuleId: 'payments',
        relationDescription: 'Disburses approved micro-loans and collects mobile repayments.',
      ),
    ],
    publishedEvents: ['microloan.applied', 'credit.scored', 'loan.disbursed'],
  ),
];

abstract class SuiteStore extends ChangeNotifier {
  String get orgId;
  bool get demo;
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> data = const {},
  ]);
  Stream<List<Map<String, dynamic>>> watch(String path);
}

class FirebaseSuiteStore extends SuiteStore {
  @override
  final String orgId;
  FirebaseSuiteStore(this.orgId);

  @override
  bool get demo => false;

  @override
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> data = const {},
  ]) async {
    final result = await FirebaseFunctions.instanceFor(
      region: 'europe-west1',
    ).httpsCallable(name).call({'orgId': orgId, ...data});
    return Map<String, dynamic>.from(result.data as Map);
  }

  @override
  Stream<List<Map<String, dynamic>>> watch(String path) => FirebaseFirestore
      .instance
      .collection('organizations/$orgId/$path')
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map((d) => <String, dynamic>{...d.data(), 'id': d.id})
            .toList(),
      );
}

class DemoSuiteStore extends SuiteStore {
  final Map<String, List<Map<String, dynamic>>> records = {
    'apps': [],
    'contacts': [],
    'products': [],
    'sales': [],
    'invoices': [],
    'tasks': [],
    'employees': [],
    'projects': [],
    'tickets': [],
    'patients': [],
    'students': [],
    'properties': [
      {'id': 'prop_01', 'name': 'Keele Heights Apartments Unit 4B', 'tenant': 'Wanjiku Enterprise Ltd', 'rentKes': 6500000, 'status': 'OCCUPIED'},
      {'id': 'prop_02', 'name': 'Kilimani Commercial Plaza Suite 12', 'tenant': 'Amina Mohamed', 'rentKes': 12000000, 'status': 'OCCUPIED'},
    ],
    'sacco_members': [
      {'id': 'sac_01', 'name': 'Kiprono Farmers Group', 'sharesKes': 45000000, 'activeLoanKes': 15000000, 'status': 'ACTIVE'},
      {'id': 'sac_02', 'name': 'David Ochieng', 'sharesKes': 850000, 'activeLoanKes': 0, 'status': 'ACTIVE'},
    ],
    'etims_logs': [],
    'payments': [],
  };

  @override
  String get orgId => 'tekntandao-demo-org';

  @override
  bool get demo => true;

  @override
  Stream<List<Map<String, dynamic>>> watch(String path) async* {
    yield List<Map<String, dynamic>>.from(records[path] ?? []);
  }

  @override
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> data = const {},
  ]) async {
    switch (name) {
      case 'saveModuleRecord':
        final app = data['appId'];
        final path = 'modules/$app/records';
        final id = '${DateTime.now().microsecondsSinceEpoch}';
        records.putIfAbsent(path, () => []).add({
          ...Map<String, dynamic>.from(data['record'] as Map),
          'kind': data['kind'], 'id': id,
        });
        notifyListeners();
        return {'id': id};
      case 'getWorkspaceContext':
        return {
          'orgId': orgId,
          'uid': 'demo-admin-user',
          'role': 'Organization Administrator',
          'orgName': 'TeknTandao Enterprise Kenya',
          'currency': 'KES',
          'country': 'KE',
          'kraPin': 'P051928471Z',
        };
      case 'getCatalog':
        return {
          'catalog': {
            for (final m in modules) m.id: {'price': m.monthlyPriceKes},
          },
        };
      case 'installApp':
        final id = data['appId'];
        if (!records['apps']!.any((a) => a['id'] == id)) {
          records['apps']!.add({'id': id, 'state': 'active', 'installedAt': '2026-09-14'});
        }
        break;
      case 'uninstallApp':
        final id = data['appId'];
        records['apps']!.removeWhere((a) => a['id'] == id);
        break;
      case 'getQuote':
        final ids = (data['apps'] as List).toSet();
        final subtotal = ids.fold<int>(0, (totalSum, id) {
          final mod = modules.firstWhere((m) => m.id == id, orElse: () => modules.first);
          return totalSum + mod.monthlyPriceKes;
        });
        final discount = ids.length >= 6
            ? 20
            : ids.length >= 3
                ? 10
                : 0;
        return {
          'subtotal': subtotal,
          'discountPercent': discount,
          'total': (subtotal * (100 - discount) / 100).round(),
        };
      case 'saveRecord':
        final app = data['appId'];
        final path = app == 'crm'
            ? 'contacts'
            : app == 'inventory'
                ? 'products'
                : app == 'hr'
                    ? 'employees'
                    : app == 'hospital'
                        ? 'patients'
                        : app == 'school'
                            ? 'students'
                            : app == 'projects'
                                ? 'projects'
                                : app == 'helpdesk'
                                    ? 'tickets'
                                    : app == 'property'
                                        ? 'properties'
                                        : app == 'sacco'
                                            ? 'sacco_members'
                                            : 'modules/$app/records';
        (records[path] ??= []).add({
          ...Map<String, dynamic>.from(data['record']),
          'id': '${app}_${DateTime.now().microsecondsSinceEpoch}',
        });
        break;
      case 'createSale':
        final requestId = data['requestId'] ?? 's_${DateTime.now().microsecondsSinceEpoch}';
        if (data.containsKey('productId')) {
          final existing = records['sales']!.where((s) => s['id'] == requestId);
          if (existing.isNotEmpty) return existing.first;

          final product = records['products']!.firstWhere((p) => p['id'] == data['productId']);
          final quantity = (data['quantity'] as num).toInt();

          product['stock'] = (product['stock'] as int) - quantity;
          final total = (product['price'] as int) * quantity;

          final sale = {
            'id': requestId,
            'contactId': data['contactId'],
            'total': total,
            'paymentState': 'unpaid',
          };
          records['sales']!.add(sale);

          final installed = records['apps']!.map((a) => a['id']).toSet();
          if (installed.contains('accounting')) {
            records['invoices']!.add({
              ...sale,
              'status': 'draft',
              'taxStatus': 'requires_tax_configuration',
            });
          }
          if (installed.contains('crm')) {
            records['tasks']!.add({
              'id': sale['id'],
              'name': 'Follow up after sale',
              'status': 'open',
            });
          }
          notifyListeners();
          return sale;
        } else {
          final customerName = data['customer'] ?? 'Walk-in Customer';
          final items = data['items'] ?? 'General Products';
          final total = ((data['total'] as num?) ?? 0).toInt();
          final payMethod = data['paymentMethod'] ?? 'M-Pesa STK';
          final mpesaReceipt = payMethod.contains('M-Pesa') ? 'QK${DateTime.now().millisecondsSinceEpoch.toString().substring(5)}X' : 'N/A';
          final etimsCode = 'KRA-OSCU-2026-${(100000 + records['sales']!.length + 1)}';

          final saleRecord = {
            'id': requestId,
            'customer': customerName,
            'items': items,
            'total': total,
            'paymentMethod': payMethod,
            'mpesaReceipt': mpesaReceipt,
            'etimsStatus': 'VERIFIED',
            'etimsControlCode': etimsCode,
            'date': '2026-09-14 12:00',
          };
          records['sales']!.add(saleRecord);

          records['invoices']!.add({
            'id': 'inv_$requestId',
            'customer': customerName,
            'amount': total,
            'status': 'PAID',
            'dueDate': '2026-09-14',
            'etimsStatus': 'VERIFIED',
            'etimsQrUrl': 'https://etims.kra.go.ke/verify/$etimsCode',
          });

          records['etims_logs']!.add({
            'id': 'et_$requestId',
            'invoiceNo': 'INV-2026-${records['sales']!.length}',
            'taxpayerPin': 'P051928471Z',
            'controlCode': etimsCode,
            'vatAmount': (total * 0.16 / 1.16).round(),
            'status': 'VERIFIED',
            'timestamp': '2026-09-14 12:00:00',
          });

          records['payments']!.add({
            'id': 'pay_$requestId',
            'provider': payMethod,
            'type': payMethod.contains('M-Pesa') ? 'STK Push' : 'Cash',
            'phone': '254700000000',
            'total': total,
            'state': 'SUCCESS',
            'receipt': mpesaReceipt,
          });
        }
        break;
      case 'triggerMpesaStk':
        final phone = data['phone'] ?? '254712345678';
        final amount = data['amount'] ?? 100000;
        final receipt = 'STK${DateTime.now().millisecondsSinceEpoch.toString().substring(4)}X';
        records['payments']!.add({
          'id': 'pay_stk_${DateTime.now().microsecondsSinceEpoch}',
          'provider': 'M-Pesa Daraja 2.0',
          'type': 'STK Push',
          'phone': phone,
          'total': amount,
          'state': 'SUCCESS',
          'receipt': receipt,
        });
        return {
          'status': 'SUCCESS',
          'message': 'STK Push delivered to $phone. Payment confirmed with receipt $receipt.',
          'receipt': receipt,
        };
      case 'reverseInvoice':
        final reversed = _demoReverseInvoice(records['invoices']!, data);
        notifyListeners();
        return reversed;
      case 'issueCreditNote':
        final credit = _demoCreditNote(records, data);
        notifyListeners();
        return credit;
      case 'netInvoices':
        final netted = _demoNetInvoices(records, data);
        notifyListeners();
        return netted;
      case 'generateReport':
        final totalSales = records['sales']!.fold<num>(0, (n, s) => n + (s['total'] as num? ?? 0));
        final totalInvoices = records['invoices']!.fold<num>(0, (n, i) => n + (i['amount'] as num? ?? 0));
        final lowStockCount = records['products']!.where((p) => ((p['stock'] as int?) ?? 0) <= 5).length;
        final overdueCount = records['invoices']!.where((i) => i['status'] == 'OVERDUE').length;

        if (data['useAi'] == true) {
          return {
            'narrative': '''
🤖 **BizOS Copilot Executive Summary & Insights:**

1. **Revenue & Cash Flow Performance:** Total gross business volume across POS & Invoicing is **${kes(totalSales + totalInvoices)}**. Direct collected POS cash/M-Pesa volume stands at **${kes(totalSales)}**.
2. **Accounts Receivable Alert:** You have **$overdueCount overdue invoices** totaling **${kes(12000000)}** (primarily Kiprono Farms SACCO). Recommended Action: Trigger automated WhatsApp payment reminder via CRM workflow.
3. **Inventory Supply Risk:** **$lowStockCount SKU items** are below threshold. Recommended Action: Auto-generate Purchase Order to supplier.
4. **KRA eTIMS Tax Compliance Rate:** **100% fiscalization compliance**. All sales invoices have valid OSCU signatures registered with KRA PIN P051928471Z.
            ''',
            'mode': 'ai_copilot',
          };
        }

        return {
          'narrative': 'Factual System Report: ${records['sales']!.length} POS sales (${kes(totalSales)}), ${records['invoices']!.length} Invoices (${kes(totalInvoices)}), $lowStockCount low stock products, ${records['employees']!.length} active staff members.',
          'mode': 'factual',
        };
      default:
        break;
    }
    notifyListeners();
    return {'ok': true};
  }
}

String kes(num minor) => 'KES ${(minor / 100).toStringAsFixed(2)}';

int _demoOpen(Map<String, dynamic> invoice) {
  final state = invoice['paymentState'];
  if (invoice['reversedBy'] != null || state == 'void' || state == 'paid' || state == 'netted' || state == 'reversed' || state == 'applied') return 0;
  final total = invoice['total'];
  if (total is! int || total < 0) throw StateError('Invalid amount in minor units');
  final netted = invoice['nettedMinor'];
  final used = netted == null ? 0 : netted as int;
  final remaining = total - used;
  if (invoice['kind'] == 'reversal' || state == 'reversal') return -remaining;
  if (state == null || state == 'unpaid') return remaining;
  return 0;
}

Map<String, dynamic>? _demoFind(List<Map<String, dynamic>> rows, Object? id) {
  for (final row in rows) {
    if (row['id'] == id) return row;
  }
  return null;
}

Map<String, dynamic> _demoReverseInvoice(List<Map<String, dynamic>> invoices, Map<String, dynamic> data) {
  final id = data['invoiceId'] as String;
  final requestId = data['requestId'] as String;
  final existing = _demoFind(invoices, requestId);
  if (existing != null) {
    if (existing['reverses'] != id) throw StateError('Request ID already used');
    return {'id': requestId};
  }
  final invoice = _demoFind(invoices, id);
  if (invoice == null) throw StateError('Invoice unavailable');
  if (invoice['kind'] == 'reversal') throw StateError('A reversal cannot be reversed here');
  if (invoice['reversedBy'] != null) throw StateError('Invoice is already reversed');
  if (invoice['activePayment'] != null) throw StateError('Resolve the in-progress payment before reversal');
  if (invoice['paymentState'] != null && invoice['paymentState'] != 'unpaid') throw StateError('Only an unpaid invoice can be reversed');
  if ((invoice['nettedMinor'] ?? 0) != 0) throw StateError('Remove netting before reversing this invoice');
  invoices.add({
    'id': requestId,
    'kind': 'reversal',
    'name': 'Reversal of ${invoice['name'] ?? id}',
    'reverses': id,
    'total': invoice['total'],
    'currency': invoice['currency'] ?? 'KES',
    'paymentState': 'applied',
    'source': invoice['source'] ?? 'accounting',
    if (invoice['contactId'] != null) 'contactId': invoice['contactId'],
    if (invoice['patientId'] != null) 'patientId': invoice['patientId'],
  });
  invoice['paymentState'] = 'reversed';
  invoice['reversedBy'] = requestId;
  return {'id': requestId};
}

Map<String, dynamic> _demoCreditNote(Map<String, List<Map<String, dynamic>>> records, Map<String, dynamic> data) {
  final invoices = records['invoices']!;
  final requestId = data['requestId'] as String? ?? 'credit_${DateTime.now().microsecondsSinceEpoch}';
  final name = data['name'];
  if (name is! String || name.trim().isEmpty) throw StateError('Invalid text');
  final trimmed = name.trim();
  final existing = _demoFind(invoices, requestId);
  if (existing != null) {
    if (existing['kind'] != 'reversal' || existing['total'] != data['total'] || existing['name'] != trimmed) throw StateError('Request ID already used');
    return {'id': requestId};
  }
  final contactId = data['contactId'];
  final patientId = data['patientId'];
  if ((contactId == null) == (patientId == null)) throw StateError('Credit belongs to one customer or one patient');
  final party = contactId == null ? records['patients'] : records['contacts'];
  if (party == null || !party.any((row) => row['id'] == (contactId ?? patientId))) throw StateError('Select an existing customer or patient');
  final total = data['total'];
  if (total is! int || total <= 0) throw StateError('Credit must be a positive amount');
  invoices.add({
    'id': requestId, 'kind': 'reversal', 'name': trimmed, 'total': total, 'currency': 'KES',
    'source': 'accounting', 'paymentState': 'reversal',
    'contactId': ?contactId,
    'patientId': ?patientId,
  });
  return {'id': requestId};
}

Map<String, dynamic> _demoNetInvoices(Map<String, List<Map<String, dynamic>>> records, Map<String, dynamic> data) {
  final invoices = records['invoices']!;
  final requestId = data['requestId'] as String;
  final nettings = records.putIfAbsent('accountingNettings', () => []);
  for (final prior in nettings) {
    if (prior['id'] != requestId) continue;
    final ids = prior['invoiceIds'];
    if (ids is! List || !ids.contains(data['leftId']) || !ids.contains(data['rightId'])) throw StateError('Request ID already used');
    return {'id': requestId};
  }
  final left = _demoFind(invoices, data['leftId']);
  final right = _demoFind(invoices, data['rightId']);
  if (left == null || right == null) throw StateError('Invoice unavailable');
  if (left['id'] == right['id']) throw StateError('Choose two different invoices');
  final leftParty = left['contactId'] ?? left['patientId'];
  final rightParty = right['contactId'] ?? right['patientId'];
  if (leftParty == null || leftParty != rightParty) throw StateError('Netting requires the same customer or patient');
  if ((left['currency'] ?? 'KES') != (right['currency'] ?? 'KES')) throw StateError('Currency mismatch');
  final a = _demoOpen(left);
  final b = _demoOpen(right);
  if (a == 0 || b == 0 || a.sign == b.sign) throw StateError('Netting needs one amount to receive and one amount to pay');
  final amount = a.abs() < b.abs() ? a.abs() : b.abs();
  for (final entry in [(left, a.sign * amount), (right, b.sign * amount)]) {
    final invoice = entry.$1;
    final apply = entry.$2;
    final total = invoice['total'] as int;
    final netted = ((invoice['nettedMinor'] as int?) ?? 0) + apply.abs();
    invoice['nettedMinor'] = netted;
    invoice['paymentState'] = netted == total ? 'netted' : (invoice['paymentState'] ?? 'unpaid');
  }
  nettings.add({'id': requestId, 'amount': amount, 'invoiceIds': [left['id'], right['id']]});
  return {'id': requestId, 'amount': amount};
}
