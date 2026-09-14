import 'suite.dart';

class AppFieldDefinition {
  final String key;
  final String label;
  final String hint;
  final bool multiline;
  final bool numeric;

  const AppFieldDefinition(
    this.key,
    this.label, {
    this.hint = '',
    this.multiline = false,
    this.numeric = false,
  });
}

class AppBlueprint {
  final String entityLabel;
  final List<AppFieldDefinition> fields;
  final List<String> statuses;

  const AppBlueprint({
    required this.entityLabel,
    required this.fields,
    required this.statuses,
  });
}

const _defaultStatuses = ['NEW', 'ACTIVE', 'ON HOLD', 'DONE', 'ARCHIVED'];

AppBlueprint blueprintFor(SuiteModule module) {
  switch (module.category) {
    case 'Sales, CRM & Revenue':
    case 'Sales & Marketing':
      return const AppBlueprint(
        entityLabel: 'Opportunity',
        fields: [
          AppFieldDefinition('owner', 'Owner'),
          AppFieldDefinition('stage', 'Stage'),
          AppFieldDefinition('value', 'Value / Revenue', numeric: true),
          AppFieldDefinition('nextAction', 'Next Action'),
          AppFieldDefinition('dueDate', 'Due Date'),
        ],
        statuses: ['LEAD', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST'],
      );
    case 'Marketing & Growth':
      return const AppBlueprint(
        entityLabel: 'Campaign',
        fields: [
          AppFieldDefinition('audience', 'Audience / Segment'),
          AppFieldDefinition('channel', 'Channel'),
          AppFieldDefinition('budget', 'Budget', numeric: true),
          AppFieldDefinition('objective', 'Objective'),
          AppFieldDefinition('launchDate', 'Launch Date'),
        ],
        statuses: ['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED'],
      );
    case 'Customer Service & Experience':
    case 'Customer Service':
      return const AppBlueprint(
        entityLabel: 'Service Item',
        fields: [
          AppFieldDefinition('customer', 'Customer'),
          AppFieldDefinition('priority', 'Priority'),
          AppFieldDefinition('channel', 'Channel'),
          AppFieldDefinition('assignee', 'Assignee'),
          AppFieldDefinition('resolution', 'Resolution / Notes', multiline: true),
        ],
        statuses: ['OPEN', 'IN PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'],
      );
    case 'Retail & Commerce':
    case 'Retail & Sales':
      return const AppBlueprint(
        entityLabel: 'Commerce Record',
        fields: [
          AppFieldDefinition('customer', 'Customer'),
          AppFieldDefinition('sku', 'SKU / Item'),
          AppFieldDefinition('quantity', 'Quantity', numeric: true),
          AppFieldDefinition('amount', 'Amount', numeric: true),
          AppFieldDefinition('fulfillment', 'Fulfillment Method'),
        ],
        statuses: ['DRAFT', 'CONFIRMED', 'PAID', 'FULFILLED', 'CANCELLED'],
      );
    case 'Accounting & Finance':
    case 'Finance':
      return const AppBlueprint(
        entityLabel: 'Finance Record',
        fields: [
          AppFieldDefinition('counterparty', 'Customer / Vendor'),
          AppFieldDefinition('account', 'Account / Ledger'),
          AppFieldDefinition('amount', 'Amount', numeric: true),
          AppFieldDefinition('reference', 'Reference'),
          AppFieldDefinition('dueDate', 'Due Date'),
        ],
        statuses: ['DRAFT', 'APPROVED', 'POSTED', 'PAID', 'VOID'],
      );
    case 'Inventory, Procurement & Supply Chain':
    case 'Supply Chain':
      return const AppBlueprint(
        entityLabel: 'Supply Record',
        fields: [
          AppFieldDefinition('item', 'Item / SKU'),
          AppFieldDefinition('location', 'Warehouse / Location'),
          AppFieldDefinition('quantity', 'Quantity', numeric: true),
          AppFieldDefinition('supplier', 'Supplier'),
          AppFieldDefinition('reference', 'PO / Batch / Reference'),
        ],
        statuses: ['REQUESTED', 'ORDERED', 'IN TRANSIT', 'RECEIVED', 'CLOSED'],
      );
    case 'Manufacturing & Industrial':
      return const AppBlueprint(
        entityLabel: 'Production Record',
        fields: [
          AppFieldDefinition('product', 'Product / BOM'),
          AppFieldDefinition('workCenter', 'Work Center / Equipment'),
          AppFieldDefinition('quantity', 'Planned Quantity', numeric: true),
          AppFieldDefinition('batch', 'Batch / Lot'),
          AppFieldDefinition('qualityResult', 'Quality Result'),
        ],
        statuses: ['PLANNED', 'RELEASED', 'IN PRODUCTION', 'QC', 'COMPLETED'],
      );
    case 'Human Resources & Workforce':
    case 'Human Resources':
      return const AppBlueprint(
        entityLabel: 'Workforce Record',
        fields: [
          AppFieldDefinition('employee', 'Employee / Candidate'),
          AppFieldDefinition('department', 'Department'),
          AppFieldDefinition('role', 'Role / Position'),
          AppFieldDefinition('date', 'Effective Date'),
          AppFieldDefinition('notes', 'Notes', multiline: true),
        ],
        statuses: ['PENDING', 'ACTIVE', 'APPROVED', 'COMPLETED', 'ARCHIVED'],
      );
    case 'Projects, Work & Collaboration':
    case 'Operations':
    case 'Productivity':
      return const AppBlueprint(
        entityLabel: 'Work Item',
        fields: [
          AppFieldDefinition('owner', 'Owner'),
          AppFieldDefinition('team', 'Team / Project'),
          AppFieldDefinition('priority', 'Priority'),
          AppFieldDefinition('dueDate', 'Due Date'),
          AppFieldDefinition('notes', 'Notes', multiline: true),
        ],
        statuses: ['BACKLOG', 'TODO', 'IN PROGRESS', 'REVIEW', 'DONE'],
      );
    case 'Automation, Low-Code & Integration':
      return const AppBlueprint(
        entityLabel: 'Automation',
        fields: [
          AppFieldDefinition('trigger', 'Trigger'),
          AppFieldDefinition('action', 'Action'),
          AppFieldDefinition('system', 'Connected System'),
          AppFieldDefinition('schedule', 'Schedule / Condition'),
          AppFieldDefinition('notes', 'Logic / Notes', multiline: true),
        ],
        statuses: ['DRAFT', 'TESTING', 'ENABLED', 'PAUSED', 'DISABLED'],
      );
    case 'Data, Analytics & AI':
      return const AppBlueprint(
        entityLabel: 'Analysis',
        fields: [
          AppFieldDefinition('source', 'Data Source'),
          AppFieldDefinition('metric', 'Metric / Question'),
          AppFieldDefinition('period', 'Period'),
          AppFieldDefinition('output', 'Output / Insight', multiline: true),
          AppFieldDefinition('owner', 'Owner'),
        ],
        statuses: ['REQUESTED', 'PROCESSING', 'READY', 'REVIEWED', 'ARCHIVED'],
      );
    case 'Legal, Compliance & Governance':
    case 'Professional Services':
      return const AppBlueprint(
        entityLabel: 'Matter',
        fields: [
          AppFieldDefinition('client', 'Client / Entity'),
          AppFieldDefinition('matterType', 'Matter / Compliance Type'),
          AppFieldDefinition('owner', 'Responsible Officer'),
          AppFieldDefinition('deadline', 'Deadline / Review Date'),
          AppFieldDefinition('notes', 'Notes / Evidence', multiline: true),
        ],
        statuses: ['OPEN', 'UNDER REVIEW', 'ACTION REQUIRED', 'COMPLIANT', 'CLOSED'],
      );
    case 'IT, Security & Administration':
      return const AppBlueprint(
        entityLabel: 'IT Record',
        fields: [
          AppFieldDefinition('asset', 'User / Asset / System'),
          AppFieldDefinition('category', 'Category'),
          AppFieldDefinition('risk', 'Risk / Severity'),
          AppFieldDefinition('owner', 'Owner'),
          AppFieldDefinition('notes', 'Technical Notes', multiline: true),
        ],
        statuses: ['OPEN', 'INVESTIGATING', 'MITIGATING', 'RESOLVED', 'CLOSED'],
      );
    case 'Web & Digital Experience':
      return const AppBlueprint(
        entityLabel: 'Digital Asset',
        fields: [
          AppFieldDefinition('url', 'URL / Slug'),
          AppFieldDefinition('audience', 'Audience'),
          AppFieldDefinition('owner', 'Owner'),
          AppFieldDefinition('publishDate', 'Publish Date'),
          AppFieldDefinition('notes', 'Content / Notes', multiline: true),
        ],
        statuses: ['DRAFT', 'REVIEW', 'PUBLISHED', 'PAUSED', 'ARCHIVED'],
      );
    case 'Healthcare':
      return const AppBlueprint(
        entityLabel: 'Clinical Record',
        fields: [
          AppFieldDefinition('patient', 'Patient / Subject'),
          AppFieldDefinition('provider', 'Clinician / Provider'),
          AppFieldDefinition('service', 'Service / Encounter'),
          AppFieldDefinition('date', 'Date / Time'),
          AppFieldDefinition('notes', 'Clinical / Operational Notes', multiline: true),
        ],
        statuses: ['REGISTERED', 'WAITING', 'IN SERVICE', 'DISCHARGED', 'CLOSED'],
      );
    case 'Education':
      return const AppBlueprint(
        entityLabel: 'Education Record',
        fields: [
          AppFieldDefinition('student', 'Student / Learner'),
          AppFieldDefinition('className', 'Class / Programme'),
          AppFieldDefinition('term', 'Term / Period'),
          AppFieldDefinition('scoreOrAmount', 'Score / Amount'),
          AppFieldDefinition('notes', 'Notes', multiline: true),
        ],
        statuses: ['PENDING', 'ENROLLED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'],
      );
    case 'Hotels, Restaurants & Hospitality':
    case 'Property & Hospitality':
      return const AppBlueprint(
        entityLabel: 'Hospitality Record',
        fields: [
          AppFieldDefinition('guest', 'Guest / Customer'),
          AppFieldDefinition('resource', 'Room / Table / Service'),
          AppFieldDefinition('date', 'Reservation / Service Date'),
          AppFieldDefinition('amount', 'Amount', numeric: true),
          AppFieldDefinition('notes', 'Notes', multiline: true),
        ],
        statuses: ['RESERVED', 'CHECKED IN', 'IN SERVICE', 'SETTLED', 'CLOSED'],
      );
    case 'Real Estate, Property & Construction':
      return const AppBlueprint(
        entityLabel: 'Property Record',
        fields: [
          AppFieldDefinition('property', 'Property / Project'),
          AppFieldDefinition('party', 'Tenant / Contractor / Owner'),
          AppFieldDefinition('unit', 'Unit / Site'),
          AppFieldDefinition('amount', 'Rent / Cost / Value', numeric: true),
          AppFieldDefinition('date', 'Due / Inspection Date'),
        ],
        statuses: ['PLANNED', 'ACTIVE', 'OCCUPIED', 'MAINTENANCE', 'CLOSED'],
      );
    case 'Transport, Mobility & Logistics':
    case 'Logistics':
      return const AppBlueprint(
        entityLabel: 'Transport Record',
        fields: [
          AppFieldDefinition('vehicle', 'Vehicle / Shipment'),
          AppFieldDefinition('driver', 'Driver / Carrier'),
          AppFieldDefinition('origin', 'Origin'),
          AppFieldDefinition('destination', 'Destination'),
          AppFieldDefinition('reference', 'Tracking / Dispatch Reference'),
        ],
        statuses: ['PLANNED', 'DISPATCHED', 'IN TRANSIT', 'DELIVERED', 'CLOSED'],
      );
    case 'Professional & Local Services':
      return const AppBlueprint(
        entityLabel: 'Service Job',
        fields: [
          AppFieldDefinition('customer', 'Customer'),
          AppFieldDefinition('service', 'Service'),
          AppFieldDefinition('assignee', 'Assignee'),
          AppFieldDefinition('appointment', 'Appointment / Due Date'),
          AppFieldDefinition('amount', 'Quoted / Billed Amount', numeric: true),
        ],
        statuses: ['REQUESTED', 'SCHEDULED', 'IN PROGRESS', 'COMPLETED', 'PAID'],
      );
    case 'Retail Industry Editions':
      return const AppBlueprint(
        entityLabel: 'Retail Record',
        fields: [
          AppFieldDefinition('item', 'Product / SKU'),
          AppFieldDefinition('supplier', 'Supplier'),
          AppFieldDefinition('quantity', 'Quantity', numeric: true),
          AppFieldDefinition('price', 'Price', numeric: true),
          AppFieldDefinition('location', 'Store / Branch'),
        ],
        statuses: ['ACTIVE', 'LOW STOCK', 'ORDERED', 'RECEIVED', 'ARCHIVED'],
      );
    case 'Africa-First Payments & Compliance':
    case 'Payments':
    case 'Compliance':
      return const AppBlueprint(
        entityLabel: 'Payment / Compliance Record',
        fields: [
          AppFieldDefinition('provider', 'Provider / Authority'),
          AppFieldDefinition('reference', 'Reference / Receipt'),
          AppFieldDefinition('amount', 'Amount', numeric: true),
          AppFieldDefinition('party', 'Customer / Taxpayer'),
          AppFieldDefinition('date', 'Transaction / Filing Date'),
        ],
        statuses: ['PENDING', 'SUBMITTED', 'VERIFIED', 'RECONCILED', 'FAILED'],
      );
    case 'SACCO, FinTech & Cooperative':
    case 'Financial Services':
      return const AppBlueprint(
        entityLabel: 'Member / Finance Record',
        fields: [
          AppFieldDefinition('member', 'Member / Borrower'),
          AppFieldDefinition('product', 'Account / Loan Product'),
          AppFieldDefinition('amount', 'Amount', numeric: true),
          AppFieldDefinition('reference', 'Reference'),
          AppFieldDefinition('dueDate', 'Due / Maturity Date'),
        ],
        statuses: ['PENDING', 'APPROVED', 'ACTIVE', 'REPAID', 'CLOSED'],
      );
    case 'Agriculture & Agribusiness':
    case 'Agriculture':
      return const AppBlueprint(
        entityLabel: 'Agriculture Record',
        fields: [
          AppFieldDefinition('farmer', 'Farmer / Farm'),
          AppFieldDefinition('crop', 'Crop / Livestock / Commodity'),
          AppFieldDefinition('season', 'Season / Cycle'),
          AppFieldDefinition('quantity', 'Quantity / Yield', numeric: true),
          AppFieldDefinition('location', 'Field / Collection Point'),
        ],
        statuses: ['PLANNED', 'IN PROGRESS', 'HARVESTED', 'DELIVERED', 'SETTLED'],
      );
    case 'Mining, Energy & Natural Resources':
      return const AppBlueprint(
        entityLabel: 'Resource Record',
        fields: [
          AppFieldDefinition('site', 'Mine / Prospect / Asset'),
          AppFieldDefinition('material', 'Mineral / Resource / Equipment'),
          AppFieldDefinition('location', 'Location / Block'),
          AppFieldDefinition('quantity', 'Quantity / Grade / Reading'),
          AppFieldDefinition('notes', 'Field / HSE Notes', multiline: true),
        ],
        statuses: ['PLANNED', 'ACTIVE', 'SAMPLING', 'REVIEW', 'COMPLETED'],
      );
    case 'NGO, Nonprofit & Development':
    case 'Non-Profit':
      return const AppBlueprint(
        entityLabel: 'Programme Record',
        fields: [
          AppFieldDefinition('programme', 'Programme / Grant'),
          AppFieldDefinition('donor', 'Donor / Partner'),
          AppFieldDefinition('beneficiary', 'Beneficiary / Community'),
          AppFieldDefinition('amount', 'Budget / Disbursement', numeric: true),
          AppFieldDefinition('indicator', 'Indicator / Outcome'),
        ],
        statuses: ['PROPOSED', 'APPROVED', 'ACTIVE', 'REPORTING', 'CLOSED'],
      );
    case 'Public Sector & Institutional':
      return const AppBlueprint(
        entityLabel: 'Public Service Record',
        fields: [
          AppFieldDefinition('citizenOrEntity', 'Citizen / Entity'),
          AppFieldDefinition('service', 'Service / Permit / Project'),
          AppFieldDefinition('department', 'Department'),
          AppFieldDefinition('reference', 'Reference Number'),
          AppFieldDefinition('deadline', 'SLA / Deadline'),
        ],
        statuses: ['RECEIVED', 'IN REVIEW', 'APPROVED', 'DELIVERED', 'CLOSED'],
      );
    case 'ESG & Sustainability':
      return const AppBlueprint(
        entityLabel: 'ESG Record',
        fields: [
          AppFieldDefinition('metric', 'Metric / Indicator'),
          AppFieldDefinition('scope', 'Scope / Site / Supplier'),
          AppFieldDefinition('value', 'Measured Value'),
          AppFieldDefinition('period', 'Reporting Period'),
          AppFieldDefinition('evidence', 'Evidence / Notes', multiline: true),
        ],
        statuses: ['DRAFT', 'MEASURED', 'VERIFIED', 'REPORTED', 'ARCHIVED'],
      );
    case 'Executive & Corporate Management':
      return const AppBlueprint(
        entityLabel: 'Executive Record',
        fields: [
          AppFieldDefinition('objective', 'Objective / Initiative'),
          AppFieldDefinition('owner', 'Executive Owner'),
          AppFieldDefinition('metric', 'KPI / Metric'),
          AppFieldDefinition('target', 'Target / Value'),
          AppFieldDefinition('reviewDate', 'Review Date'),
        ],
        statuses: ['PLANNED', 'ON TRACK', 'AT RISK', 'OFF TRACK', 'COMPLETED'],
      );
    case 'AI-native applications beyond Zoho/Odoo':
      return const AppBlueprint(
        entityLabel: 'AI Job',
        fields: [
          AppFieldDefinition('goal', 'Goal / Instruction'),
          AppFieldDefinition('dataScope', 'Allowed Data Scope'),
          AppFieldDefinition('model', 'Model / Capability'),
          AppFieldDefinition('guardrail', 'Approval / Guardrail'),
          AppFieldDefinition('output', 'Expected Output', multiline: true),
        ],
        statuses: ['DRAFT', 'READY', 'RUNNING', 'REVIEW REQUIRED', 'COMPLETED'],
      );
    default:
      return const AppBlueprint(
        entityLabel: 'Record',
        fields: [
          AppFieldDefinition('category', 'Category / Type'),
          AppFieldDefinition('owner', 'Owner'),
          AppFieldDefinition('reference', 'Reference'),
          AppFieldDefinition('value', 'Primary Value'),
          AppFieldDefinition('notes', 'Notes', multiline: true),
        ],
        statuses: _defaultStatuses,
      );
  }
}
