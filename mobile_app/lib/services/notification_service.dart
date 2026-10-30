import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'api_service.dart';

class NotificationService {
  static final NotificationService instance = NotificationService._();
  NotificationService._();

  static const MethodChannel _nativeChannel =
      MethodChannel('blessing.admin/notifications');

  bool _initialized = false;
  Timer? _syncTimer;
  int _pollTick = 0;
  String? _lastSeenOrderNumber;
  bool _initialSupportPollDone = false;
  final Map<String, String> _lastConvoSnapshot = {};
  final Map<String, DateTime> _recentAlertKeys = {};

  // Real-time SSE LiveSync stream for instant (<50ms) support chat & queue updates
  final StreamController<Map<String, dynamic>> _supportEventController =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get liveSupportEvents =>
      _supportEventController.stream;

  // In-app top push banner stream so alerts are always visible even while using the app
  final StreamController<Map<String, String>> _inAppBannerController =
      StreamController<Map<String, String>>.broadcast();
  Stream<Map<String, String>> get inAppBannerAlerts =>
      _inAppBannerController.stream;

  http.Client? _sseClient;
  bool _sseRunning = false;
  String? _activeOpenConversationId;

  void setActiveOpenConversation(String? conversationId) {
    _activeOpenConversationId = conversationId;
  }

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;
  }

  /// Request Android 13+ notification permissions via Native MethodChannel
  Future<bool> requestPermissionIfNeeded() async {
    try {
      final bool? granted =
          await _nativeChannel.invokeMethod<bool>('requestPermission');
      return granted ?? true;
    } catch (e) {
      debugPrint('requestPermissionIfNeeded error: $e');
      return false;
    }
  }

  Future<void> openNotificationSettings() async {
    try {
      await _nativeChannel.invokeMethod('openNotificationSettings');
    } catch (_) {}
  }

  bool _shouldFireDeduped(String key) {
    final now = DateTime.now();
    _recentAlertKeys.removeWhere(
      (_, ts) => now.difference(ts).inSeconds > 20,
    );
    if (_recentAlertKeys.containsKey(key)) {
      return false;
    }
    _recentAlertKeys[key] = now;
    return true;
  }

  /// Fire instant native Heads-up Order Alert
  Future<String> showOrderAlert({
    required String orderNumber,
    required String studentName,
    required int amount,
    bool openSettingsOnFail = false,
  }) async {
    final title = '⚡ NEW ORDER #$orderNumber RECEIVED!';
    final body =
        '$studentName has paid ₹$amount. Tap to open and prepare package.';

    HapticFeedback.heavyImpact();
    _inAppBannerController.add({
      'type': 'order',
      'title': title,
      'body': body,
      'orderNumber': orderNumber,
    });

    try {
      final status = await _nativeChannel.invokeMethod<String>(
        'showNotification',
        {
          'title': title,
          'body': body,
          'type': 'order',
          'openSettingsOnFail': openSettingsOnFail,
        },
      );
      return status ?? 'OK';
    } catch (e) {
      debugPrint('showOrderAlert error: $e');
      return 'ERROR: $e';
    }
  }

  /// Fire instant native Support Message Alert
  Future<String> showSupportAlert({
    required String studentName,
    required String message,
    String? titleOverride,
    String? conversationId,
    bool openSettingsOnFail = false,
  }) async {
    final title = titleOverride ?? '💬 Support Message from $studentName';
    final body = message.trim().isNotEmpty
        ? message.trim()
        : 'Student is waiting for a reply in Support Inbox';

    final dedupKey = 'support:${conversationId ?? studentName}:$title:$body';
    if (!openSettingsOnFail && !_shouldFireDeduped(dedupKey)) {
      return 'DEDUPED';
    }

    HapticFeedback.heavyImpact();
    _inAppBannerController.add({
      'type': 'support',
      'title': title,
      'body': body,
      'conversationId': conversationId ?? '',
    });

    try {
      final status = await _nativeChannel.invokeMethod<String>(
        'showNotification',
        {
          'title': title,
          'body': body,
          'type': 'support',
          'openSettingsOnFail': openSettingsOnFail,
        },
      );
      return status ?? 'OK';
    } catch (e) {
      debugPrint('showSupportAlert error: $e');
      return 'ERROR: $e';
    }
  }

  /// Connect persistent Real-Time SSE stream (/api/support/stream?admin=1)
  Future<void> _connectRealTimeSupportStream() async {
    if (_sseRunning) return;
    _sseRunning = true;

    while (_sseRunning && ApiService.instance.isAuthenticated) {
      try {
        _sseClient?.close();
        _sseClient = http.Client();
        final req = http.Request(
          'GET',
          Uri.parse('${ApiService.baseUrl}/api/support/stream?admin=1'),
        );
        req.headers.addAll(ApiService.instance.authHeaders);
        req.headers['Accept'] = 'text/event-stream';
        req.headers['Cache-Control'] = 'no-cache';

        final response = await _sseClient!.send(req);
        if (response.statusCode == 200) {
          await for (final chunk
              in response.stream.transform(utf8.decoder).transform(
                    const LineSplitter(),
                  )) {
            if (!_sseRunning || !ApiService.instance.isAuthenticated) break;
            if (!chunk.startsWith('data:')) continue;
            final payload = chunk.substring(5).trim();
            if (payload.isEmpty) continue;

            try {
              final ev = jsonDecode(payload);
              if (ev is Map<String, dynamic>) {
                _supportEventController.add(ev);
                _handleLiveEventNotification(ev);
              }
            } catch (_) {}
          }
        }
      } catch (_) {
        // Reconnect after brief backoff if network drops
      }
      if (_sseRunning) {
        await Future.delayed(const Duration(seconds: 2));
      }
    }
  }

  void _handleLiveEventNotification(Map<String, dynamic> ev) {
    final type = (ev['type'] ?? '').toString();
    final convId = (ev['conversationId'] ?? '').toString();
    final senderType = (ev['senderType'] ?? '').toString().toUpperCase();
    final senderName = (ev['senderName'] ?? 'Student').toString();
    final text = (ev['text'] ?? '').toString();

    if (type == 'SUPPORT_REQUESTED') {
      showSupportAlert(
        studentName: senderName,
        conversationId: convId,
        titleOverride: '🔔 New Support Request: $senderName',
        message: text.isNotEmpty
            ? text
            : 'Student is waiting in the Support Queue to talk.',
      );
    } else if (type == 'NEW_MESSAGE' && senderType == 'CUSTOMER') {
      if (_activeOpenConversationId != convId) {
        showSupportAlert(
          studentName: senderName,
          conversationId: convId,
          message: text.isNotEmpty ? text : 'Sent a new message in support chat',
        );
      }
    }
  }

  /// Direct VPS Background Poller (3s fast delta) + Real-Time SSE Stream without Firebase
  void startBackgroundSync() {
    requestPermissionIfNeeded();
    _connectRealTimeSupportStream();

    _syncTimer?.cancel();
    _syncTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      if (!ApiService.instance.isAuthenticated) return;
      _pollTick++;

      // Poll support conversations every 3 seconds for instant fallback detection
      try {
        final convos = await ApiService.instance.fetchSupportConversations();
        if (!_initialSupportPollDone) {
          for (final c in convos) {
            _lastConvoSnapshot[c.id] =
                '${c.status.toUpperCase()}|${c.lastMessage ?? ""}';
          }
          _initialSupportPollDone = true;
        } else {
          bool anyChanged = false;
          for (final c in convos) {
            final statusUpper = c.status.toUpperCase();
            final msg = (c.lastMessage ?? '').trim();
            final currentSnap = '$statusUpper|$msg';
            final prevSnap = _lastConvoSnapshot[c.id];

            if (prevSnap != currentSnap) {
              anyChanged = true;
              final prevParts = prevSnap?.split('|');
              final prevStatus = prevParts != null && prevParts.isNotEmpty
                  ? prevParts.first
                  : '';
              final prevMsg = prevParts != null && prevParts.length > 1
                  ? prevParts.sublist(1).join('|')
                  : '';

              _lastConvoSnapshot[c.id] = currentSnap;

              // Case 1: Conversation newly entered WAITING_ADMIN queue
              if (statusUpper == 'WAITING_ADMIN' &&
                  prevStatus != 'WAITING_ADMIN') {
                await showSupportAlert(
                  studentName: c.userName ?? 'Student',
                  conversationId: c.id,
                  titleOverride:
                      '🔔 Waiting in Queue: ${c.userName ?? "Student"}',
                  message: msg.isNotEmpty ? msg : 'Requested live support help',
                );
              }
              // Case 2: New message arrived on WAITING_ADMIN or ACTIVE chat
              else if ((statusUpper == 'WAITING_ADMIN' ||
                      statusUpper == 'ACTIVE') &&
                  msg.isNotEmpty &&
                  msg != prevMsg &&
                  _activeOpenConversationId != c.id) {
                await showSupportAlert(
                  studentName: c.userName ?? 'Student',
                  conversationId: c.id,
                  message: msg,
                );
              }
            }
          }
          if (anyChanged) {
            _supportEventController.add({'type': 'POLL_SYNC'});
          }
        }
      } catch (_) {}

      // Poll new orders every 9 seconds (every 3rd tick)
      if (_pollTick % 3 == 0) {
        try {
          final orders = await ApiService.instance.fetchOrders();
          if (orders.isNotEmpty) {
            final latest = orders.first;
            if (_lastSeenOrderNumber != null &&
                latest.orderNumber != _lastSeenOrderNumber &&
                latest.status.toLowerCase() == 'confirmed') {
              await showOrderAlert(
                orderNumber: latest.orderNumber,
                studentName: latest.studentName ?? 'Student',
                amount: latest.totalAmount,
              );
            }
            _lastSeenOrderNumber = latest.orderNumber;
          }
        } catch (_) {}
      }
    });
  }

  void stopBackgroundSync() {
    _sseRunning = false;
    _sseClient?.close();
    _sseClient = null;
    _syncTimer?.cancel();
    _syncTimer = null;
    _initialSupportPollDone = false;
    _lastConvoSnapshot.clear();
  }
}
