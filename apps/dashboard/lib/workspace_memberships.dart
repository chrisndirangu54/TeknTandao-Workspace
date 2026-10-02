import 'dart:convert';
import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class WorkspaceMembership {
  final String id;
  final String name;
  final String role;

  const WorkspaceMembership({
    required this.id,
    required this.name,
    required this.role,
  });

  factory WorkspaceMembership.fromDocument(
    QueryDocumentSnapshot<Map<String, dynamic>> document,
  ) => WorkspaceMembership(
    id: document.id,
    name: document.data()['name']?.toString() ?? 'Unnamed workspace',
    role: document.data()['role']?.toString() ?? 'member',
  );
}

class WorkspaceMembershipService {
  final FirebaseFirestore _db;

  WorkspaceMembershipService({FirebaseFirestore? firestore})
    : _db = firestore ?? FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _memberships(String uid) =>
      _db.collection('users').doc(uid).collection('workspaces');

  Stream<List<WorkspaceMembership>> watch(String uid) =>
      _memberships(uid).snapshots().map((snapshot) {
        final workspaces = snapshot.docs
            .map(WorkspaceMembership.fromDocument)
            .toList(growable: false);
        return workspaces
          ..sort((left, right) => left.name.compareTo(right.name));
      });

  Future<String> ensureInitialWorkspace(
    User user, {
    String? previousWorkspaceId,
    required String defaultName,
  }) async {
    final memberships = await _memberships(user.uid).get();
    if (memberships.docs.isNotEmpty) {
      final activeId =
          memberships.docs.any((document) => document.id == previousWorkspaceId)
          ? previousWorkspaceId!
          : memberships.docs.first.id;
      await select(user.uid, activeId);
      return activeId;
    }

    if (previousWorkspaceId != null && previousWorkspaceId.isNotEmpty) {
      final membershipRef = _db.doc(
        'organizations/$previousWorkspaceId/members/${user.uid}',
      );
      final membership = await membershipRef.get();
      if (membership.exists) {
        final organization = await _db
            .doc('organizations/$previousWorkspaceId')
            .get();
        if (organization.exists) {
          await _memberships(user.uid).doc(previousWorkspaceId).set({
            'workspaceId': previousWorkspaceId,
            'name': organization.data()?['name']?.toString() ?? 'Workspace',
            'role': membership.data()?['role']?.toString() ?? 'member',
            'joinedAt': FieldValue.serverTimestamp(),
          });
          await select(user.uid, previousWorkspaceId);
          return previousWorkspaceId;
        }
      }
    }

    return (await create(user, defaultName)).id;
  }

  Future<WorkspaceMembership> create(User user, String name) async {
    final workspaceName = name.trim().isEmpty ? 'My organization' : name.trim();
    if (workspaceName.length > 120) {
      throw ArgumentError('Workspace names must be 120 characters or fewer.');
    }
    final organizationRef = _db.collection('organizations').doc();
    final memberRef = organizationRef.collection('members').doc(user.uid);
    final membershipRef = _memberships(user.uid).doc(organizationRef.id);
    final userRef = _db.collection('users').doc(user.uid);

    await _db.runTransaction((transaction) async {
      transaction.set(organizationRef, {
        'name': workspaceName,
        'createdAt': FieldValue.serverTimestamp(),
        'owner': user.uid,
        'currency': 'KES',
      });
      transaction.set(memberRef, {'role': 'owner', 'apps': <String>[]});
      transaction.set(membershipRef, {
        'workspaceId': organizationRef.id,
        'name': workspaceName,
        'role': 'owner',
        'joinedAt': FieldValue.serverTimestamp(),
      });
      transaction.set(userRef, {
        'orgId': organizationRef.id,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });

    return WorkspaceMembership(
      id: organizationRef.id,
      name: workspaceName,
      role: 'owner',
    );
  }

  Future<void> select(String uid, String workspaceId) async {
    final membership = await _memberships(uid).doc(workspaceId).get();
    if (!membership.exists) {
      throw StateError('You are not a member of that workspace.');
    }
    final organizationMembership = await _db
        .doc('organizations/$workspaceId/members/$uid')
        .get();
    if (!organizationMembership.exists) {
      throw StateError(
        'Your membership in that workspace is no longer active.',
      );
    }
    await _db.collection('users').doc(uid).set({
      'orgId': workspaceId,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  Future<String> createInvite(User user, WorkspaceMembership workspace) async {
    if (workspace.role != 'owner') {
      throw StateError('Only workspace owners can create invite links.');
    }
    final random = Random.secure();
    final token = base64Url
        .encode(List<int>.generate(24, (_) => random.nextInt(256)))
        .replaceAll('=', '');
    final inviteRef = _db.doc(
      'organizations/${workspace.id}/workspaceInvites/$token',
    );
    await inviteRef.set({
      'active': true,
      'workspaceId': workspace.id,
      'workspaceName': workspace.name,
      'createdBy': user.uid,
      'createdAt': FieldValue.serverTimestamp(),
      'expiresAt': Timestamp.fromDate(
        DateTime.now().toUtc().add(const Duration(days: 30)),
      ),
    });

    final origin = Uri.base.host.isEmpty
        ? Uri.parse('https://tekntandaoworkspace.web.app')
        : Uri.base;
    return Uri(
      scheme: origin.scheme,
      host: origin.host,
      port: origin.hasPort ? origin.port : null,
      path: '/',
      queryParameters: {'workspace': workspace.id, 'invite': token},
    ).toString();
  }

  Future<void> joinWithInvite({
    required User user,
    required String workspaceId,
    required String token,
  }) async {
    final inviteRef = _db.doc(
      'organizations/$workspaceId/workspaceInvites/$token',
    );
    final memberRef = _db.doc('organizations/$workspaceId/members/${user.uid}');
    final membershipRef = _memberships(user.uid).doc(workspaceId);
    final userRef = _db.collection('users').doc(user.uid);

    await _db.runTransaction((transaction) async {
      final inviteSnapshot = await transaction.get(inviteRef);
      if (!inviteSnapshot.exists) {
        throw StateError('This workspace invite link is invalid.');
      }
      final invite = inviteSnapshot.data()!;
      final expiresAt = invite['expiresAt'];
      if (invite['active'] != true ||
          invite['workspaceId'] != workspaceId ||
          expiresAt is! Timestamp ||
          !expiresAt.toDate().isAfter(DateTime.now())) {
        throw StateError(
          'This workspace invite link has expired or was revoked.',
        );
      }

      final memberSnapshot = await transaction.get(memberRef);
      final workspaceLinkSnapshot = await transaction.get(membershipRef);
      final role = memberSnapshot.exists
          ? memberSnapshot.data()!['role']?.toString() ?? 'member'
          : 'member';
      if (!memberSnapshot.exists) {
        transaction.set(memberRef, {
          'role': 'member',
          'apps': <String>[],
          'inviteId': token,
        });
      }
      if (!workspaceLinkSnapshot.exists) {
        transaction.set(membershipRef, {
          'workspaceId': workspaceId,
          'name': invite['workspaceName'],
          'role': role,
          'joinedAt': FieldValue.serverTimestamp(),
        });
      }
      transaction.set(userRef, {
        'orgId': workspaceId,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });
  }
}
