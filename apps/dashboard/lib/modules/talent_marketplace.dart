import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../suite.dart';
import '../widgets/record_form.dart';
import 'agentic_matching.dart';

class TalentMarketplaceService {
  final FirebaseFirestore _db;

  TalentMarketplaceService({FirebaseFirestore? firestore})
    : _db = firestore ?? FirebaseFirestore.instance;

  Stream<List<Map<String, dynamic>>> watchPublicCandidates() => _db
      .collection('talentProfiles')
      .where('isPublic', isEqualTo: true)
      .limit(200)
      .snapshots()
      .map((snapshot) => snapshot.docs
          .map((document) => <String, dynamic>{...document.data(), 'id': document.id})
          .toList(growable: false));

  Stream<List<Map<String, dynamic>>> watchOpenRoles() => _db
      .collection('talentJobPostings')
      .where('status', isEqualTo: 'OPEN')
      .limit(200)
      .snapshots()
      .map((snapshot) => snapshot.docs
          .map((document) => <String, dynamic>{...document.data(), 'id': document.id})
          .toList(growable: false));

  Stream<List<Map<String, dynamic>>> watchEmployerRoles(String orgId) => _db
      .collection('talentJobPostings')
      .where('employerOrgId', isEqualTo: orgId)
      .limit(100)
      .snapshots()
      .map((snapshot) => snapshot.docs
          .map((document) => <String, dynamic>{...document.data(), 'id': document.id})
          .toList(growable: false));

  Stream<List<Map<String, dynamic>>> watchCandidateRequests(String uid) => _db
      .collection('talentContactRequests')
      .where('candidateUid', isEqualTo: uid)
      .limit(50)
      .snapshots()
      .map((snapshot) => snapshot.docs
          .map((document) => <String, dynamic>{...document.data(), 'id': document.id})
          .toList(growable: false));

  Stream<List<Map<String, dynamic>>> watchEmployerRequests(String orgId) => _db
      .collection('talentContactRequests')
      .where('employerOrgId', isEqualTo: orgId)
      .limit(50)
      .snapshots()
      .map((snapshot) => snapshot.docs
          .map((document) => <String, dynamic>{...document.data(), 'id': document.id})
          .toList(growable: false));

  Future<Map<String, dynamic>?> getCandidateProfile(String uid) async {
    final snapshot = await _db.collection('talentProfiles').doc(uid).get();
    return snapshot.data();
  }

  Future<void> saveCandidateProfile({
    required String uid,
    required String alias,
    required String skills,
    required String targetRoles,
    required String location,
    required int experienceYears,
    required String bio,
    required bool isPublic,
    required bool consented,
  }) async {
    if (isPublic && !consented) {
      throw StateError('Confirm consent before publishing your profile.');
    }
    await _db.collection('talentProfiles').doc(uid).set({
      'displayAlias': _clean(alias, 80),
      'skills': _split(skills),
      'targetRoles': _split(targetRoles),
      'location': _clean(location, 120),
      'experienceYears': experienceYears.clamp(0, 60),
      'bio': _clean(bio, 500),
      'isPublic': isPublic,
      if (isPublic) 'consentAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  Future<void> createJobPosting({
    required String orgId,
    required String employerName,
    required String title,
    required String department,
    required String requiredSkills,
    required String location,
    required int experienceYears,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) throw StateError('Sign in to publish a role.');
    await _db.collection('talentJobPostings').add({
      'employerOrgId': orgId,
      'employerName': _clean(employerName, 120),
      'createdBy': user.uid,
      'title': _clean(title, 120),
      'department': _clean(department, 100),
      'requiredSkills': _split(requiredSkills),
      'location': _clean(location, 120),
      'experienceYears': experienceYears.clamp(0, 60),
      'status': 'OPEN',
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> createContactRequest({
    required Map<String, dynamic> candidate,
    required String employerOrgId,
    required String employerName,
    required String roleId,
    required String roleTitle,
    required int matchScore,
    required List<String> matchedSkills,
    required List<String> missingSkills,
    required String type,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) throw StateError('Sign in to contact a candidate.');
    await _db.collection('talentContactRequests').add({
      'candidateUid': candidate['id'],
      'candidateAlias': candidate['displayAlias'],
      'employerOrgId': employerOrgId,
      'employerName': employerName,
      'employerOwnerUid': user.uid,
      'roleId': roleId,
      'roleTitle': roleTitle,
      'matchScore': matchScore.clamp(0, 100),
      'matchedSkills': matchedSkills.take(20).toList(growable: false),
      'missingSkills': missingSkills.take(20).toList(growable: false),
      'type': type,
      'status': 'PENDING',
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> respondToContactRequest({
    required String requestId,
    required bool accept,
    String? sharedEmail,
  }) async {
    final values = <String, dynamic>{
      'status': accept ? 'ACCEPTED' : 'DECLINED',
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (accept && sharedEmail != null && sharedEmail.trim().isNotEmpty) {
      values['sharedEmail'] = _clean(sharedEmail, 254);
    }
    await _db.collection('talentContactRequests').doc(requestId).update(values);
  }

  List<String> _split(String value) => value
      .split(RegExp(r'[,;|]'))
      .map((item) => _clean(item, 50))
      .where((item) => item.isNotEmpty)
      .take(30)
      .toList(growable: false);

  String _clean(String value, int maxLength) {
    final clean = value.trim().replaceAll(RegExp(r'[\x00-\x1F]'), ' ');
    return clean.length <= maxLength ? clean : clean.substring(0, maxLength);
  }
}

class TalentProfileScreen extends StatefulWidget {
  final User user;
  final TalentMarketplaceService service;

  const TalentProfileScreen({
    super.key,
    required this.user,
    required this.service,
  });

  @override
  State<TalentProfileScreen> createState() => _TalentProfileScreenState();
}

class _TalentProfileScreenState extends State<TalentProfileScreen> {
  final _alias = TextEditingController();
  final _skills = TextEditingController();
  final _targetRoles = TextEditingController();
  final _location = TextEditingController();
  final _experience = TextEditingController(text: '0');
  final _bio = TextEditingController();
  bool _loading = true;
  bool _saving = false;
  bool _public = false;
  bool _consented = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  @override
  void dispose() {
    _alias.dispose();
    _skills.dispose();
    _targetRoles.dispose();
    _location.dispose();
    _experience.dispose();
    _bio.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    try {
      final profile = await widget.service.getCandidateProfile(widget.user.uid);
      if (profile != null) {
        _alias.text = profile['displayAlias']?.toString() ?? '';
        _skills.text = _join(profile['skills']);
        _targetRoles.text = _join(profile['targetRoles']);
        _location.text = profile['location']?.toString() ?? '';
        _experience.text = profile['experienceYears']?.toString() ?? '0';
        _bio.text = profile['bio']?.toString() ?? '';
        _public = profile['isPublic'] == true;
        _consented = _public;
      }
    } catch (error) {
      _error = error.toString();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    final experience = int.tryParse(_experience.text.trim());
    if (_alias.text.trim().isEmpty ||
        _skills.text.trim().isEmpty ||
        _targetRoles.text.trim().isEmpty ||
        experience == null ||
        experience < 0 ||
        experience > 60) {
      setState(() => _error = 'Enter an alias, skills, target roles, and valid experience.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.service.saveCandidateProfile(
        uid: widget.user.uid,
        alias: _alias.text,
        skills: _skills.text,
        targetRoles: _targetRoles.text,
        location: _location.text,
        experienceYears: experience,
        bio: _bio.text,
        isPublic: _public,
        consented: _consented,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_public ? 'Profile published.' : 'Profile saved privately.')),
        );
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Talent profile')),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Your profile is private until you publish it. Published profiles share only your alias, skills, target roles, broad location, and experience.',
                style: TextStyle(color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _alias,
                maxLength: 80,
                decoration: const InputDecoration(labelText: 'Public alias'),
              ),
              TextField(
                controller: _skills,
                maxLength: 1000,
                decoration: const InputDecoration(
                  labelText: 'Skills',
                  helperText: 'Comma-separated, e.g. Flutter, accounting, procurement',
                ),
              ),
              TextField(
                controller: _targetRoles,
                maxLength: 500,
                decoration: const InputDecoration(
                  labelText: 'Target roles',
                  helperText: 'Comma-separated role titles',
                ),
              ),
              TextField(
                controller: _location,
                maxLength: 120,
                decoration: const InputDecoration(labelText: 'City / region'),
              ),
              TextField(
                controller: _experience,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Years of experience'),
              ),
              TextField(
                controller: _bio,
                maxLength: 500,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Short professional summary'),
              ),
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                value: _public,
                title: const Text('Publish to the candidate marketplace'),
                onChanged: (value) => setState(() {
                  _public = value;
                  if (!value) _consented = false;
                }),
              ),
              if (_public)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _consented,
                  title: const Text('I agree to share this profile with signed-in employer workspaces.'),
                  onChanged: (value) => setState(() => _consented = value ?? false),
                ),
              if (_error != null)
                Text(_error!, style: const TextStyle(color: Colors.red)),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: const Icon(Icons.save_rounded),
                label: Text(_saving ? 'Saving…' : 'Save profile'),
              ),
              const SizedBox(height: 28),
              const Text('Employer introductions', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              _candidateRequests(),
            ],
          ),
  );

  Widget _candidateRequests() => StreamBuilder<List<Map<String, dynamic>>>(
    stream: widget.service.watchCandidateRequests(widget.user.uid),
    builder: (context, snapshot) {
      if (snapshot.hasError) return Text('Requests unavailable: ${snapshot.error}');
      if (!snapshot.hasData) return const LinearProgressIndicator();
      if (snapshot.data!.isEmpty) return const Text('No employer requests yet.');
      return Column(
        children: [
          for (final request in snapshot.data!)
            Card(
              child: ListTile(
                title: Text('${request['employerName']} · ${request['roleTitle']}'),
                subtitle: Text('Match ${request['matchScore']}% · ${_join(request['matchedSkills'])} · ${request['status']}'),
                trailing: request['status'] == 'PENDING'
                    ? Wrap(
                        children: [
                          IconButton(
                            tooltip: 'Accept and share account email',
                            onPressed: () => widget.service.respondToContactRequest(
                              requestId: request['id'].toString(),
                              accept: true,
                              sharedEmail: widget.user.email,
                            ),
                            icon: const Icon(Icons.check_circle_outline_rounded),
                          ),
                          IconButton(
                            tooltip: 'Decline',
                            onPressed: () => widget.service.respondToContactRequest(
                              requestId: request['id'].toString(),
                              accept: false,
                            ),
                            icon: const Icon(Icons.cancel_outlined),
                          ),
                        ],
                      )
                    : Text(request['status'].toString()),
              ),
            ),
        ],
      );
    },
  );
}

class HiringInsightsPanel extends StatefulWidget {
  final SuiteStore store;
  const HiringInsightsPanel({super.key, required this.store});

  @override
  State<HiringInsightsPanel> createState() => _HiringInsightsPanelState();
}

class _HiringInsightsPanelState extends State<HiringInsightsPanel> {
  final TalentMarketplaceService _service = TalentMarketplaceService();
  String _employerName = '';

  @override
  void initState() {
    super.initState();
    _loadEmployerName();
  }

  Future<void> _loadEmployerName() async {
    try {
      final org = await FirebaseFirestore.instance
          .collection('organizations')
          .doc(widget.store.orgId)
          .get();
      if (mounted) setState(() => _employerName = org.data()?['name']?.toString() ?? 'Organization');
    } catch (_) {
      if (mounted) setState(() => _employerName = 'Organization');
    }
  }

  Future<void> _publishRole() async {
    final fields = await recordForm(
      context,
      'Publish an open role',
      ['Job title', 'Department', 'Required skills (comma separated)', 'City / region', 'Minimum experience years'],
    );
    if (fields == null || !mounted) return;
    final years = int.tryParse(fields[4].trim());
    if (fields[0].trim().isEmpty || fields[2].trim().isEmpty || years == null || years < 0 || years > 60) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a title, required skills, and valid experience.')));
      return;
    }
    try {
      await _service.createJobPosting(
        orgId: widget.store.orgId,
        employerName: _employerName,
        title: fields[0],
        department: fields[1],
        requiredSkills: fields[2],
        location: fields[3],
        experienceYears: years,
      );
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not publish role: $error')));
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Agentic hiring insights', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              const Text('Match opted-in job seekers to open roles, surface missing skills, and request introductions. Scores are explainable decision support; hiring decisions stay with your team.', style: TextStyle(color: Color(0xFF64748B))),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _publishRole,
                icon: const Icon(Icons.add_task_rounded),
                label: const Text('Publish open role'),
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 12),
      _buildRoles(),
      const SizedBox(height: 16),
      _buildRequests(),
    ],
  );

  Widget _buildRoles() => StreamBuilder<List<Map<String, dynamic>>>(
    stream: _service.watchEmployerRoles(widget.store.orgId),
    builder: (context, roleSnapshot) {
      if (roleSnapshot.hasError) return _error('Roles unavailable: ${roleSnapshot.error}');
      if (!roleSnapshot.hasData) return const LinearProgressIndicator();
      final roles = roleSnapshot.data!.where((role) => role['status'] == 'OPEN').toList();
      return StreamBuilder<List<Map<String, dynamic>>>(
        stream: _service.watchPublicCandidates(),
        builder: (context, candidateSnapshot) {
          if (candidateSnapshot.hasError) return _error('Talent pool unavailable: ${candidateSnapshot.error}');
          if (!candidateSnapshot.hasData) return const LinearProgressIndicator();
          final candidates = candidateSnapshot.data!;
          return StreamBuilder<List<Map<String, dynamic>>>(
            stream: widget.store.watch('employees'),
            builder: (context, employeeSnapshot) {
              final employees = employeeSnapshot.data ?? const <Map<String, dynamic>>[];
              final gaps = workforceSkillGaps(roles, employees);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (gaps.isNotEmpty)
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.insights_rounded, color: Color(0xFFB45309)),
                        title: const Text('Current workforce skill gaps'),
                        subtitle: Text(gaps.join(' · ')),
                      ),
                    ),
                  if (roles.isEmpty)
                    const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Publish an open role to match it with opted-in job seekers.'))),
                  for (final role in roles) _roleCard(role, candidates),
                ],
              );
            },
          );
        },
      );
    },
  );

  Widget _roleCard(Map<String, dynamic> role, List<Map<String, dynamic>> candidates) {
    final matches = rankCandidates(role, candidates).take(5).toList();
    return Card(
      margin: const EdgeInsets.only(top: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${role['title']} · ${role['department'] ?? 'Team'}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            Text('${role['location'] ?? 'Location flexible'} · Skills: ${(role['requiredSkills'] as List? ?? const []).join(', ')}'),
            const SizedBox(height: 8),
            if (matches.isEmpty) const Text('No opted-in candidates match this role yet.'),
            for (final match in matches)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('${match.candidate['displayAlias']} · ${match.score}% fit'),
                subtitle: Text('Matched: ${match.matchedSkills.join(', ')}\nTo develop: ${match.missingSkills.join(', ')}'),
                trailing: IconButton(
                  tooltip: 'Request introduction',
                  onPressed: () => _service.createContactRequest(
                    candidate: match.candidate,
                    employerOrgId: widget.store.orgId,
                    employerName: _employerName,
                    roleId: role['id'].toString(),
                    roleTitle: role['title'].toString(),
                    matchScore: match.score,
                    matchedSkills: match.matchedSkills,
                    missingSkills: match.missingSkills,
                    type: 'EMPLOYER_INVITE',
                  ).catchError((Object error) {
                    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$error')));
                  }),
                  icon: const Icon(Icons.person_add_alt_rounded),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildRequests() => StreamBuilder<List<Map<String, dynamic>>>(
    stream: _service.watchEmployerRequests(widget.store.orgId),
    builder: (context, snapshot) {
      if (snapshot.hasError) return _error('Introduction requests unavailable: ${snapshot.error}');
      if (!snapshot.hasData) return const LinearProgressIndicator();
      final requests = snapshot.data!;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Talent introductions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          for (final request in requests)
            Card(
              child: ListTile(
                title: Text('${request['candidateAlias']} · ${request['roleTitle']}'),
                subtitle: Text('Status: ${request['status']}${request['sharedEmail'] == null ? '' : ' · ${request['sharedEmail']}'}'),
              ),
            ),
        ],
      );
    },
  );

  Widget _error(String text) => Card(child: Padding(padding: const EdgeInsets.all(14), child: Text(text)));
}

String _join(Object? value) => value is Iterable
    ? value.map((item) => item.toString()).join(', ')
    : value?.toString() ?? '';
