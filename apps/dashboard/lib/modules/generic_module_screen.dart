import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class GenericEnterpriseModuleScreen extends StatelessWidget {
  final SuiteModule module;
  final SuiteStore store;

  const GenericEnterpriseModuleScreen({
    super.key,
    required this.module,
    required this.store,
  });

  List<String> _getFormFields(String id) {
    switch (id) {
      case 'analytics':
        return ['Dashboard Title', 'Data Source SQL', 'Chart Type (Bar/Line/Pie)', 'Refresh Rate'];
      case 'surveys':
        return ['Survey Name', 'Target Audience', 'Question 1', 'NPS Threshold'];
      case 'expenses':
        return ['Employee Name', 'Expense Category', 'Amount (KES)', 'Receipt Reference'];
      case 'subscriptions':
        return ['Customer Name', 'Plan Tier', 'Monthly Fee (KES)', 'Billing Cycle'];
      case 'recruitment':
        return ['Job Position Title', 'Department', 'Required Experience', 'Opening Status'];
      case 'lms':
        return ['Course Title', 'Target Skill', 'Video Modules Count', 'Passing Score'];
      case 'social':
        return ['Post Content', 'Social Networks (X/LinkedIn/Meta)', 'Scheduled Date', 'Campaign Tag'];
      case 'livechat':
        return ['Widget Name', 'Primary Agent', 'Bot Welcome Message', 'Escalation Queue'];
      case 'knowledge':
        return ['SOP Title', 'Department', 'Document Version', 'Author'];
      case 'events':
        return ['Event Name', 'Venue Location', 'Ticket Price (KES)', 'Max Capacity'];
      case 'assets':
        return ['Asset Tag ID', 'Asset Description', 'Purchase Value (KES)', 'Depreciation Method'];
      case 'quality':
        return ['Inspection Batch ID', 'Product SKU', 'Inspector Name', 'Pass Criteria'];
      case 'wms':
        return ['Bin Location Code', 'Rack Zone', 'SKU Item ID', 'Current Count'];
      case 'contracts':
        return ['Contract Title', 'Counterparty Name', 'Effective Date', 'Contract Value (KES)'];
      case 'agri':
        return ['Farmer Outgrower Name', 'Crop Type', 'Weighed Quantity (Kg)', 'Payout Amount (KES)'];
      case 'freight':
        return ['Bill of Lading No', 'Shipping Line', 'Container ID', 'Customs Status'];
      case 'legal':
        return ['Case Docket Number', 'Client Name', 'Court Location', 'Hearing Date'];
      case 'microfinance':
        return ['Borrower Name', 'Requested Loan Amount (KES)', 'Collateral Type', 'Interest Rate %'];
      case 'vault':
        return ['Secret / Credential Name', 'Service Endpoint', 'Username / API Key', 'Security Tier'];
      case 'desk_phone':
        return ['Virtual Phone Number', 'Call Queue Group', 'Agent Extension', 'Recording Policy'];
      case 'payroll':
        return ['Employee Name', 'Basic Salary (KES)', 'NSSF Contribution', 'SHA / Tax Rate'];
      case 'discussions':
        return ['Channel Name', 'Channel Topic', 'Access Tier', 'Created By'];
      default:
        return ['Record Title', 'Category', 'Primary Value', 'Notes / Status'];
    }
  }

  List<Map<String, dynamic>> _getSampleRecords(String id) {
    switch (id) {
      case 'analytics':
        return [
          {'title': 'Executive Revenue & eTIMS Dashboard', 'source': 'KRA Fiscal Stream', 'chart': 'Multi-Bar', 'status': 'LIVE'},
          {'title': 'M-Pesa STK Conversion Rate Analytics', 'source': 'Daraja API Logs', 'chart': 'Funnel', 'status': 'LIVE'},
        ];
      case 'surveys':
        return [
          {'title': 'Q3 Customer Satisfaction Survey', 'target': 'All POS Buyers', 'q1': 'How satisfied are you?', 'status': 'ACTIVE'},
          {'title': 'Employee Work Culture Feedback', 'target': 'Internal Staff', 'q1': 'Rate remote flexibility', 'status': 'COMPLETED'},
        ];
      case 'expenses':
        return [
          {'title': 'Fuel Claim - KDA 492X Truck', 'category': 'Fleet Logistics', 'amount': 'KES 14,500', 'status': 'APPROVED'},
          {'title': 'Client Lunch Retainer Brief', 'category': 'Sales & CRM', 'amount': 'KES 8,200', 'status': 'PENDING'},
        ];
      case 'subscriptions':
        return [
          {'title': 'Enterprise ERP License - Safaricom', 'plan': 'Tier 1 Enterprise', 'amount': 'KES 850,000 / mo', 'status': 'ACTIVE'},
          {'title': 'SaaS POS Retainer - Java House', 'plan': 'Multi-Branch POS', 'amount': 'KES 320,000 / mo', 'status': 'ACTIVE'},
        ];
      case 'recruitment':
        return [
          {'title': 'Senior Flutter SaaS Engineer', 'dept': 'Product & Engineering', 'exp': '5+ Years', 'status': 'INTERVIEWING'},
          {'title': 'eTIMS Tax Specialist Accountant', 'dept': 'Finance', 'exp': '3+ Years', 'status': 'OPEN'},
        ];
      case 'lms':
        return [
          {'title': 'KRA eTIMS Fiscal Compliance 101', 'skill': 'Tax Law', 'modules': '6 Video Lessons', 'status': 'ENROLLED'},
          {'title': 'Customer Service & SLA Mastery', 'skill': 'Helpdesk', 'modules': '4 Modules', 'status': 'PASSED'},
        ];
      case 'social':
        return [
          {'title': 'African Business OS Launch Teaser', 'channels': 'LinkedIn & Twitter/X', 'scheduled': '2026-09-15 09:00', 'status': 'SCHEDULED'},
          {'title': 'M-Pesa Paybill Integration Case Study', 'channels': 'Meta & LinkedIn', 'scheduled': '2026-09-16 14:00', 'status': 'DRAFT'},
        ];
      case 'livechat':
        return [
          {'title': 'Main Web Storefront Widget', 'agent': 'AI Copilot Bot', 'status': 'ONLINE'},
          {'title': 'WhatsApp Support Gateway', 'agent': 'Helpdesk Team', 'status': 'ACTIVE'},
        ];
      case 'knowledge':
        return [
          {'title': 'SOP: Daily POS Shift Closing & Cash Reconciliation', 'dept': 'Retail Operations', 'version': 'v2.4', 'status': 'PUBLISHED'},
          {'title': 'SOP: KRA eTIMS OSCU Certificate Renewal', 'dept': 'Finance & Compliance', 'version': 'v1.1', 'status': 'PUBLISHED'},
        ];
      case 'events':
        return [
          {'title': 'East Africa SaaS & AI Summit 2026', 'venue': 'KICC Nairobi', 'ticket': 'KES 15,000', 'status': 'REGISTRATION OPEN'},
          {'title': 'SME Digital Transformation Workshop', 'venue': 'Radisson Blu Upper Hill', 'ticket': 'KES 5,000', 'status': 'SOLD OUT'},
        ];
      case 'assets':
        return [
          {'title': 'Thermal Receipt Printer Fleet (50 Units)', 'tag': 'AST-2026-081', 'value': 'KES 1,200,000', 'status': 'ACTIVE'},
          {'title': 'Dell PowerEdge Rack Server', 'tag': 'AST-2026-012', 'value': 'KES 850,000', 'status': 'ACTIVE'},
        ];
      case 'quality':
        return [
          {'title': 'Batch QC Inspection #4901', 'sku': '500g Packaged Blend Coffee', 'inspector': 'Quality Manager Koech', 'status': 'PASSED'},
          {'title': 'Non-Conformance Report (NCR) #102', 'sku': 'Packaging Seals', 'inspector': 'Auditor Amina', 'status': 'FLAGGED'},
        ];
      case 'wms':
        return [
          {'title': 'Rack Zone A - Bin 14B', 'sku': 'Solar Inverter 5kW', 'count': '42 Units', 'status': 'VERIFIED'},
          {'title': 'Rack Zone C - Bin 02A', 'sku': 'POS Thermal Paper Boxes', 'count': '180 Boxes', 'status': 'VERIFIED'},
        ];
      case 'contracts':
        return [
          {'title': 'Master Enterprise SLA Contract', 'party': 'Equitel Kenya Ltd', 'effective': '2026-01-01', 'status': 'SIGNED'},
          {'title': 'Office Lease Agreement Kilimani Plaza', 'party': 'Kilimani Properties', 'effective': '2025-06-01', 'status': 'ACTIVE'},
        ];
      case 'agri':
        return [
          {'title': 'Rift Valley Tea Farmers Outgrower Batch', 'farmer': 'Kiprono Outgrower Co-op', 'qty': '14,500 Kg', 'status': 'PAID VIA M-PESA'},
          {'title': 'Central Kenya Coffee Aggregation', 'farmer': 'Nyeri Farmers Association', 'qty': '8,200 Kg', 'status': 'WEIGHED'},
        ];
      case 'freight':
        return [
          {'title': 'Bill of Lading #MSC-902148', 'line': 'MSC Mediterranean Shipping', 'container': 'TGHU-881029', 'status': 'PORT CLEARED'},
          {'title': 'Bill of Lading #MAERSK-11204', 'line': 'Maersk Line', 'container': 'MSKU-440219', 'status': 'CUSTOMS INSPECTION'},
        ];
      case 'legal':
        return [
          {'title': 'Docket #CIVIL-2026-1049', 'client': 'TeknTandao Holdings Ltd', 'court': 'Milimani Law Courts Nairobi', 'status': 'HEARING SCHEDULED'},
          {'title': 'Trademark Registration IP Protection', 'client': 'African Business OS', 'court': 'KIPI Industrial Property', 'status': 'REGISTERED'},
        ];
      case 'microfinance':
        return [
          {'title': 'Micro-loan Application #ML-4029', 'borrower': 'Mama Mboga Traders Group', 'amount': 'KES 150,000', 'status': 'APPROVED & DISBURSED'},
          {'title': 'Boda Boda Asset Finance Loan', 'borrower': 'John Mwangi', 'amount': 'KES 220,000', 'status': 'ACTIVE REPAYMENT'},
        ];
      case 'vault':
        return [
          {'title': 'KRA eTIMS VSCU Private Signing Certificate', 'endpoint': 'https://etims.kra.go.ke/api', 'user': 'P051928471Z_KEY', 'status': 'ENCRYPTED'},
          {'title': 'Safaricom M-Pesa Daraja 2.0 Consumer Secret', 'endpoint': 'https://api.safaricom.co.ke', 'user': 'DARAJA_PROD_KEY', 'status': 'ENCRYPTED'},
        ];
      case 'desk_phone':
        return [
          {'title': '+254 20 790 0000 (Main Switchboard)', 'queue': 'Customer Support & Sales', 'agent': 'Ext 101-110', 'status': 'ONLINE'},
          {'title': '+254 700 111 222 (M-Pesa Helpline)', 'queue': 'Payment Reconciliation Queue', 'agent': 'Ext 201-205', 'status': 'ONLINE'},
        ];
      case 'payroll':
        return [
          {'title': 'September 2026 Executive & Staff Payroll', 'salary': 'KES 12,450,000 Total', 'nssf': 'KES 432,000', 'status': 'DISBURSED VIA M-PESA'},
          {'title': 'Statutory Tax Returns (PAYE & SHA)', 'salary': 'KRA PIN P051928471Z', 'nssf': 'iTax Filed', 'status': 'FILED'},
        ];
      case 'discussions':
        return [
          {'title': '#general-announcements', 'topic': 'All-hands executive updates', 'access': 'PUBLIC', 'status': 'ACTIVE'},
          {'title': '#engineering-architecture', 'topic': 'African Business OS core updates', 'access': 'INTERNAL', 'status': 'ACTIVE'},
        ];
      default:
        return [
          {'title': '${module.name} Sample Item 1', 'category': module.category, 'val': '100%', 'status': 'ACTIVE'},
          {'title': '${module.name} Sample Item 2', 'category': module.category, 'val': 'KES 50,000', 'status': 'COMPLETED'},
        ];
    }
  }

  @override
  Widget build(BuildContext context) {
    final fields = _getFormFields(module.id);
    final samples = _getSampleRecords(module.id);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Icon(module.icon, color: module.color),
            const SizedBox(width: 10),
            Text(module.name),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _buildStatCard('Module Category', module.category, Icons.grid_view_rounded, module.color),
                const SizedBox(width: 16),
                _buildStatCard('Monthly Plan', '${kes(module.monthlyPriceKes)} / mo', Icons.verified_rounded, const Color(0xFF10B981)),
                const SizedBox(width: 16),
                _buildStatCard('Data Events', '${module.publishedEvents.length} Event Stream', Icons.hub_rounded, const Color(0xFF3B82F6)),
              ],
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${module.name.toUpperCase()} RECORDS & DATA LOGS',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
                ),
                ElevatedButton.icon(
                  onPressed: () async {
                    final details = await recordForm(context, 'Add ${module.name} Record', fields);
                    if (details != null && details[0].isNotEmpty) {
                      await store.call('saveRecord', {
                        'appId': module.id,
                        'record': {
                          'title': details[0],
                          'field2': details.length > 1 ? details[1] : '',
                          'field3': details.length > 2 ? details[2] : '',
                          'field4': details.length > 3 ? details[3] : '',
                          'status': 'ACTIVE',
                        }
                      });
                    }
                  },
                  icon: const Icon(Icons.add_circle_outline_rounded, size: 16),
                  label: const Text('Add record'),
                )
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: store.watch(module.id),
              builder: (context, snapshot) {
                final list = snapshot.data != null && snapshot.data!.isNotEmpty
                    ? snapshot.data!
                    : samples;
                return Card(
                  child: ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: list.length,
                    separatorBuilder: (context, index) => const Divider(height: 1),
                    itemBuilder: (context, idx) {
                      final item = list[idx];
                      final firstVal = item['title'] ?? item['name'] ?? 'Record Item #${idx + 1}';
                      final subText = item.entries
                          .where((e) => e.key != 'title' && e.key != 'name' && e.key != 'status' && e.key != 'id')
                          .map((e) => '${e.key}: ${e.value}')
                          .take(3)
                          .join(' · ');

                      return ListTile(
                        leading: CircleAvatar(
                          backgroundColor: module.color.withValues(alpha: 0.1),
                          child: Icon(module.icon, color: module.color),
                        ),
                        title: Text(firstVal, style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text(subText.isEmpty ? module.description : subText),
                        trailing: Chip(
                          label: Text(item['status']?.toString() ?? 'ACTIVE'),
                          backgroundColor: const Color(0xFFEFF6FF),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatCard(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 12),
            Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
            const SizedBox(height: 4),
            Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
          ],
        ),
      ),
    );
  }
}
