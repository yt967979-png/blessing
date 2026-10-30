import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/order_model.dart';
import '../models/support_model.dart';

class ApiService {
  static const String baseUrl = 'https://blessingpowerguide.in';
  static final ApiService instance = ApiService._();
  ApiService._();

  String? _adminToken;
  String? _deviceId;
  String? _adminId;
  String? _adminEmail;
  String? _adminName;

  bool get isAuthenticated => _adminToken != null && _adminToken!.isNotEmpty;
  String? get adminId => _adminId;
  String? get adminEmail => _adminEmail;
  String? get adminName => _adminName;
  String get currentActorId =>
      (_adminId != null && _deviceId != null && _deviceId!.isNotEmpty)
          ? '$_adminId::$_deviceId'
          : (_adminId ?? '');

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _adminToken = prefs.getString('admin_token');
    _deviceId = prefs.getString('admin_device_id');
    _adminId = prefs.getString('admin_id');
    _adminEmail = prefs.getString('admin_email');
    _adminName = prefs.getString('admin_name');
  }

  Map<String, String> get authHeaders => _headers;

  Map<String, String> get _headers {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': baseUrl,
      'Referer': '$baseUrl/admin',
      'x-client-platform': 'android-app',
    };
    if (_adminToken != null && _adminToken!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_adminToken';
      if (_deviceId != null && _deviceId!.isNotEmpty) {
        headers['x-device-id'] = _deviceId!;
        headers['Cookie'] = 'bpg_session=$_adminToken; bpg_device=$_deviceId';
      } else {
        headers['Cookie'] = 'bpg_session=$_adminToken';
      }
    }
    return headers;
  }

  void _extractCookiesFromResponse(http.Response res) {
    final setCookie = res.headers['set-cookie'] ?? '';
    final sessionMatch = RegExp(r'bpg_session=([^;,\s]+)').firstMatch(setCookie);
    final deviceMatch = RegExp(r'bpg_device=([^;,\s]+)').firstMatch(setCookie);
    if (sessionMatch != null) {
      _adminToken = Uri.decodeComponent(sessionMatch.group(1)!);
    }
    if (deviceMatch != null) {
      _deviceId = Uri.decodeComponent(deviceMatch.group(1)!);
    }
  }

  Future<void> _persistSession(Map<String, dynamic> data, http.Response res, String fallbackEmail) async {
    _extractCookiesFromResponse(res);
    if (data['token'] != null && data['token'].toString().isNotEmpty) {
      _adminToken = data['token'].toString();
    }
    if (data['deviceId'] != null && data['deviceId'].toString().isNotEmpty) {
      _deviceId = data['deviceId'].toString();
    }
    if (data['user']?['id'] != null) {
      _adminId = data['user']['id'].toString();
    }
    _adminEmail = (data['user']?['email'] ?? fallbackEmail).toString();
    _adminName = (data['user']?['name'] ?? 'Admin').toString();

    final prefs = await SharedPreferences.getInstance();
    if (_adminToken != null) {
      await prefs.setString('admin_token', _adminToken!);
    }
    if (_deviceId != null) {
      await prefs.setString('admin_device_id', _deviceId!);
    }
    if (_adminId != null) {
      await prefs.setString('admin_id', _adminId!);
    }
    await prefs.setString('admin_email', _adminEmail!);
    await prefs.setString('admin_name', _adminName!);
  }

  /// Poll /api/admin/mobile-auth?state=... for completed Google Sign-In
  Future<Map<String, dynamic>> pollGoogleHandshake(String state) async {
    try {
      final res = await http.get(
        Uri.parse('$baseUrl/api/admin/mobile-auth?state=${Uri.encodeComponent(state)}'),
        headers: {
          'Accept': 'application/json',
          'Origin': baseUrl,
        },
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['success'] == true && data['token'] != null) {
          await _persistSession(data, res, 'admin@blessingpowerguide.in');
          return {'success': true, 'user': data['user']};
        }
      }
      return {'pending': true};
    } catch (_) {
      return {'pending': true};
    }
  }

  /// Admin Login via Email + Registered Mobile Number (or Password)
  Future<Map<String, dynamic>> loginAdmin({
    required String emailOrPhone,
    required String password,
  }) async {
    try {
      final res = await http.post(
        Uri.parse('$baseUrl/api/admin/mobile-auth'),
        headers: {
          'Content-Type': 'application/json',
          'Origin': baseUrl,
          'Referer': '$baseUrl/admin',
        },
        body: jsonEncode({
          'email': emailOrPhone.trim(),
          'phone': emailOrPhone.trim(),
          'password': password.trim(),
        }),
      );

      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['user'] != null) {
        final role = (data['user']['role'] ?? 'customer').toString();
        if (role != 'admin' && role != 'super_admin') {
          return {
            'success': false,
            'error':
                'Access Restricted: Account "${data['user']['email'] ?? emailOrPhone}" is not an Administrator.',
          };
        }
        await _persistSession(data, res, emailOrPhone.trim());
        return {'success': true, 'user': data['user']};
      }

      return {
        'success': false,
        'error': data['error'] ??
            'Invalid credentials. Enter your Admin Email and Registered 10-digit Mobile Number (or Password).',
      };
    } catch (e) {
      return {'success': false, 'error': 'Connection error: $e'};
    }
  }

  Future<void> logout() async {
    _adminToken = null;
    _deviceId = null;
    _adminId = null;
    _adminEmail = null;
    _adminName = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('admin_token');
    await prefs.remove('admin_device_id');
    await prefs.remove('admin_id');
    await prefs.remove('admin_email');
    await prefs.remove('admin_name');
  }

  /// 1. Look up Order by Barcode (Step 1)
  Future<Map<String, dynamic>> lookupOrder(String rawCode) async {
    try {
      final clean = Uri.encodeComponent(rawCode.trim());
      final res = await http.get(
        Uri.parse('$baseUrl/api/admin/orders/lookup?code=$clean'),
        headers: _headers,
      );
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        return {'success': true, 'order': AdminOrder.fromJson(data['order'])};
      }
      return {
        'success': false,
        'error': data['error'] ?? 'Order not found',
      };
    } catch (e) {
      return {'success': false, 'error': 'Failed to lookup order: $e'};
    }
  }

  /// 2. Scan & Dispatch ST Courier AWB (Step 2)
  Future<Map<String, dynamic>> scanDispatch({
    required String orderId,
    required String awbNumber,
    bool force = false,
  }) async {
    try {
      final res = await http.post(
        Uri.parse('$baseUrl/api/admin/orders/scan-dispatch'),
        headers: _headers,
        body: jsonEncode({
          'orderId': orderId.trim(),
          'awbNumber': awbNumber.trim().toUpperCase(),
          'force': force,
        }),
      );
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        return {
          'success': true,
          'order': data['order'],
          'stCourierUrl': data['order']?['stCourierUrl'] ??
              'https://stcourier.com/track/shipment?docket=${awbNumber.trim()}',
          'whatsAppShareUrl': data['order']?['whatsAppShareUrl'],
        };
      }
      return {
        'success': false,
        'error': data['error'] ?? 'Failed to dispatch order',
        'requiresForce': data['requiresForce'] == true,
      };
    } catch (e) {
      return {'success': false, 'error': 'Dispatch error: $e'};
    }
  }

  /// 3. Fetch Orders List
  Future<List<AdminOrder>> fetchOrders({String? status, String? search}) async {
    try {
      String url = '$baseUrl/api/orders?limit=100';
      if (search != null && search.isNotEmpty) {
        url += '&orderId=${Uri.encodeComponent(search)}';
      }

      final res = await http.get(Uri.parse(url), headers: _headers);
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data is List) {
          return data
              .whereType<Map<String, dynamic>>()
              .map((json) => AdminOrder.fromJson(json))
              .toList();
        }
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  /// 4. Fetch Support Conversations (Flat list for Dashboard & Notifications)
  Future<List<SupportConversation>> fetchSupportConversations() async {
    final q = await fetchSupportQueue();
    final combined = <SupportConversation>[
      ...(q['waiting'] as List<SupportConversation>),
      ...(q['active'] as List<SupportConversation>),
      ...(q['resolved'] as List<SupportConversation>).take(20),
    ];
    return combined;
  }

  /// 4b. Fetch Structured Support Queue (Waiting, Active, Resolved + currentAdminId)
  Future<Map<String, dynamic>> fetchSupportQueue() async {
    try {
      final res = await http.get(
        Uri.parse('$baseUrl/api/admin/support'),
        headers: _headers,
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data is Map<String, dynamic>) {
          final waiting = (data['waiting'] is List)
              ? (data['waiting'] as List)
                  .whereType<Map<String, dynamic>>()
                  .map(SupportConversation.fromJson)
                  .toList()
              : <SupportConversation>[];
          final active = (data['active'] is List)
              ? (data['active'] as List)
                  .whereType<Map<String, dynamic>>()
                  .map(SupportConversation.fromJson)
                  .toList()
              : <SupportConversation>[];
          final resolved = (data['resolved'] is List)
              ? (data['resolved'] as List)
                  .whereType<Map<String, dynamic>>()
                  .map(SupportConversation.fromJson)
                  .toList()
              : <SupportConversation>[];

          return {
            'currentAdminId':
                data['currentAdminId']?.toString() ?? currentActorId,
            'waiting': waiting,
            'active': active,
            'resolved': resolved,
          };
        }
      }
    } catch (_) {}
    return {
      'currentAdminId': currentActorId,
      'waiting': <SupportConversation>[],
      'active': <SupportConversation>[],
      'resolved': <SupportConversation>[],
    };
  }

  /// 4c. Atomic Claim ("Accept Chat") — Strictly One Admin at a Time
  Future<Map<String, dynamic>> claimSupportConversation(
    String conversationId,
  ) async {
    try {
      final res = await http.post(
        Uri.parse('$baseUrl/api/support/claim'),
        headers: _headers,
        body: jsonEncode({'conversationId': conversationId}),
      );
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        return {
          'success': true,
          'conversation': data['conversation'] is Map<String, dynamic>
              ? SupportConversation.fromJson(data['conversation'])
              : null,
          'assignedAdminName': data['assignedAdminName']?.toString(),
        };
      }
      return {
        'success': false,
        'status': res.statusCode,
        'error': data['error'] ??
            'This conversation has already been accepted by another admin.',
      };
    } catch (e) {
      return {'success': false, 'error': 'Network error accepting chat: $e'};
    }
  }

  /// 5. Fetch Messages + Live Conversation Status
  Future<Map<String, dynamic>> fetchMessagesWithStatus(
    String conversationId,
  ) async {
    try {
      final res = await http.get(
        Uri.parse(
          '$baseUrl/api/admin/support?view=messages&conversationId=${Uri.encodeComponent(conversationId)}',
        ),
        headers: _headers,
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = data['messages'] ?? data;
        final msgs = (list is List)
            ? list
                .whereType<Map<String, dynamic>>()
                .map((m) => SupportMessage.fromJson(m))
                .toList()
            : <SupportMessage>[];
        final conv = data['conversation'] is Map<String, dynamic>
            ? SupportConversation.fromJson(data['conversation'])
            : null;
        return {
          'messages': msgs,
          'conversation': conv,
          'currentAdminId':
              data['currentAdminId']?.toString() ?? currentActorId,
        };
      }
    } catch (_) {}
    return {
      'messages': <SupportMessage>[],
      'conversation': null,
      'currentAdminId': currentActorId,
    };
  }

  Future<List<SupportMessage>> fetchMessages(String conversationId) async {
    final res = await fetchMessagesWithStatus(conversationId);
    return res['messages'] as List<SupportMessage>;
  }

  /// 6. Send Support Reply to Student (with Lock & Ended Enforcement)
  Future<Map<String, dynamic>> sendSupportReplyResult(
    String conversationId,
    String content,
  ) async {
    try {
      final res = await http.post(
        Uri.parse('$baseUrl/api/support/message'),
        headers: _headers,
        body: jsonEncode({
          'conversationId': conversationId,
          'text': content.trim(),
        }),
      );
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 || res.statusCode == 201) {
        return {'success': true};
      }
      return {
        'success': false,
        'status': res.statusCode,
        'error': data['error'] ?? 'Failed to send reply.',
      };
    } catch (_) {
      return {'success': false, 'error': 'Network error sending reply.'};
    }
  }

  Future<bool> sendSupportReply(String conversationId, String content) async {
    final r = await sendSupportReplyResult(conversationId, content);
    return r['success'] == true;
  }

  /// 7. Resolve / End Support Conversation
  Future<Map<String, dynamic>> resolveSupportConversationResult(
    String conversationId,
  ) async {
    try {
      final res = await http.patch(
        Uri.parse('$baseUrl/api/admin/support'),
        headers: _headers,
        body: jsonEncode({
          'conversationId': conversationId,
          'action': 'resolve',
        }),
      );
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        return {'success': true};
      }
      return {
        'success': false,
        'error': data['error'] ?? 'Failed to resolve chat.',
      };
    } catch (_) {
      return {'success': false, 'error': 'Network error resolving chat.'};
    }
  }

  Future<bool> resolveSupportConversation(String conversationId) async {
    final r = await resolveSupportConversationResult(conversationId);
    return r['success'] == true;
  }
}
