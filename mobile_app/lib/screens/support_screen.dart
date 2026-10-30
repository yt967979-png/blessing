import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/support_model.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';

const List<String> _kCannedReplies = [
  "Hi! I'm checking your order and ST Courier dispatch details right now.",
  'Your guides have been securely packed and handed over to ST Courier.',
  'Could you please confirm your delivery pincode or full school address?',
  'A replacement copy has been approved and dispatched at no extra cost.',
  'Is there anything else I can help you with today?',
];

class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  int _selectedQueueTab = 0; // 0: Waiting, 1: Active, 2: Ended
  bool _isLoading = true;
  String? _claimingConvId;
  String _currentAdminId = '';
  List<SupportConversation> _waiting = [];
  List<SupportConversation> _active = [];
  List<SupportConversation> _resolved = [];
  Timer? _queuePollTimer;
  StreamSubscription<Map<String, dynamic>>? _liveEventSub;

  @override
  void initState() {
    super.initState();
    _loadQueues();

    // Instant Real-Time SSE LiveSync listener (<50ms)
    _liveEventSub = NotificationService.instance.liveSupportEvents.listen((ev) {
      final type = (ev['type'] ?? '').toString();
      if (type == 'SUPPORT_REQUESTED' ||
          type == 'CHAT_CLAIMED' ||
          type == 'CHAT_RESOLVED' ||
          type == 'CONVERSATION_UPDATED' ||
          type == 'NEW_MESSAGE') {
        _loadQueues(silent: true);
      }
    });

    // Fast fallback queue sync every 4s
    _queuePollTimer = Timer.periodic(
      const Duration(seconds: 4),
      (_) => _loadQueues(silent: true),
    );
  }

  @override
  void dispose() {
    _liveEventSub?.cancel();
    _queuePollTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadQueues({bool silent = false}) async {
    if (!silent) {
      setState(() => _isLoading = true);
    }
    final q = await ApiService.instance.fetchSupportQueue();
    if (!mounted) return;
    setState(() {
      _currentAdminId = (q['currentAdminId'] ?? '').toString();
      _waiting = q['waiting'] as List<SupportConversation>;
      _active = q['active'] as List<SupportConversation>;
      _resolved = q['resolved'] as List<SupportConversation>;
      _isLoading = false;
    });
  }

  Future<void> _handleAcceptChat(SupportConversation convo) async {
    if (_claimingConvId != null) return;
    setState(() => _claimingConvId = convo.id);

    final res = await ApiService.instance.claimSupportConversation(convo.id);
    if (!mounted) return;
    setState(() => _claimingConvId = null);

    if (res['success'] == true) {
      final claimed = (res['conversation'] as SupportConversation?) ??
          SupportConversation(
            id: convo.id,
            userName: convo.userName,
            userPhone: convo.userPhone,
            orderId: convo.orderId,
            lastMessage: convo.lastMessage,
            status: 'ACTIVE',
            assignedAdminId: _currentAdminId,
            assignedAdminName: res['assignedAdminName']?.toString() ?? 'Admin',
            updatedAt: DateTime.now(),
          );
      setState(() => _selectedQueueTab = 1);
      await _loadQueues(silent: true);
      if (!mounted) return;
      _openConversation(claimed);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '❌ ${res['error'] ?? "Already accepted by another admin."}',
          ),
          backgroundColor: const Color(0xFFEF4444),
          duration: const Duration(seconds: 3),
        ),
      );
      await _loadQueues(silent: true);
    }
  }

  void _openConversation(SupportConversation convo) {
    if (convo.status.toUpperCase() == 'ACTIVE' &&
        !convo.isAssignedToMe(_currentAdminId)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '🔒 Locked: Handled by ${convo.assignedAdminName ?? "another admin"}. Only one admin can access a chat at a time.',
          ),
          backgroundColor: const Color(0xFFF59E0B),
          duration: const Duration(seconds: 3),
        ),
      );
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _ChatDetailScreen(
          conversation: convo,
          initialAdminId: _currentAdminId,
        ),
      ),
    ).then((_) => _loadQueues(silent: true));
  }

  Widget _buildTabButton({
    required int index,
    required String label,
    required int count,
    required Color badgeColor,
  }) {
    final isSelected = _selectedQueueTab == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _selectedQueueTab = index),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
          decoration: BoxDecoration(
            color: isSelected
                ? const Color(0xFFFFB703)
                : const Color(0xFF112240),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? const Color(0xFFFFB703) : Colors.white12,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color:
                        isSelected ? const Color(0xFF001B3A) : Colors.white70,
                    fontWeight: FontWeight.w900,
                    fontSize: 12,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: isSelected
                      ? const Color(0xFF001B3A)
                      : badgeColor.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '$count',
                  style: TextStyle(
                    color: isSelected ? const Color(0xFFFFB703) : badgeColor,
                    fontWeight: FontWeight.w900,
                    fontSize: 10.5,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final currentList = _selectedQueueTab == 0
        ? _waiting
        : _selectedQueueTab == 1
            ? _active
            : _resolved;

    return Column(
      children: [
        // LiveSync Status Banner + 3-Queue Tab Bar
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: Color(0xFF10B981),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 6),
                      const Text(
                        'REAL-TIME SSE LIVESYNC ACTIVE',
                        style: TextStyle(
                          color: Color(0xFF10B981),
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.7,
                        ),
                      ),
                    ],
                  ),
                  const Text(
                    '1 Admin Per Chat Lock',
                    style: TextStyle(
                      color: Colors.white54,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  _buildTabButton(
                    index: 0,
                    label: 'Waiting',
                    count: _waiting.length,
                    badgeColor: const Color(0xFFF59E0B),
                  ),
                  const SizedBox(width: 8),
                  _buildTabButton(
                    index: 1,
                    label: 'Active',
                    count: _active.length,
                    badgeColor: const Color(0xFF10B981),
                  ),
                  const SizedBox(width: 8),
                  _buildTabButton(
                    index: 2,
                    label: 'Ended',
                    count: _resolved.length,
                    badgeColor: Colors.white54,
                  ),
                ],
              ),
            ],
          ),
        ),

        Expanded(
          child: _isLoading
              ? const Center(
                  child: CircularProgressIndicator(color: Color(0xFFFFB703)),
                )
              : currentList.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(20),
                              decoration: BoxDecoration(
                                color: const Color(0xFF112240),
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white10),
                              ),
                              child: Icon(
                                _selectedQueueTab == 0
                                    ? Icons.check_circle_outline
                                    : _selectedQueueTab == 1
                                        ? Icons.support_agent
                                        : Icons.history,
                                color: const Color(0xFFFFB703),
                                size: 46,
                              ),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              _selectedQueueTab == 0
                                  ? 'Waiting Queue is Empty!'
                                  : _selectedQueueTab == 1
                                      ? 'No Active Support Chats'
                                      : 'No Ended Chats Yet',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              _selectedQueueTab == 0
                                  ? 'When a student requests live agent help on blessingpowerguide.in, their ticket will appear here instantly.'
                                  : _selectedQueueTab == 1
                                      ? 'Accept a waiting chat from the Waiting tab to start talking with a student.'
                                      : 'Completed and ended support conversations appear here.',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: Colors.white60,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 16),
                            ElevatedButton.icon(
                              onPressed: () => _loadQueues(),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFFFFB703),
                                foregroundColor: const Color(0xFF001B3A),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              icon: const Icon(Icons.refresh, size: 18),
                              label: const Text(
                                'Refresh Queue',
                                style: TextStyle(fontWeight: FontWeight.w800),
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: () => _loadQueues(),
                      color: const Color(0xFFFFB703),
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: currentList.length,
                        itemBuilder: (context, index) {
                          final convo = currentList[index];
                          final statusUpper = convo.status.toUpperCase();
                          final isWaiting = statusUpper == 'WAITING_ADMIN' ||
                              statusUpper == 'BOT';
                          final isActive = statusUpper == 'ACTIVE';
                          final isResolved = statusUpper == 'RESOLVED';
                          final isMine = convo.isAssignedToMe(_currentAdminId);
                          final isClaiming = _claimingConvId == convo.id;

                          return GestureDetector(
                            onTap: () => _openConversation(convo),
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 12),
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: const Color(0xFF112240),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                  color: isWaiting
                                      ? const Color(0xFFF59E0B)
                                          .withValues(alpha: 0.5)
                                      : isActive
                                          ? (isMine
                                              ? const Color(0xFF10B981)
                                                  .withValues(alpha: 0.5)
                                              : Colors.redAccent
                                                  .withValues(alpha: 0.4))
                                          : Colors.white10,
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      CircleAvatar(
                                        radius: 22,
                                        backgroundColor: const Color(0xFFFFB703)
                                            .withValues(alpha: 0.15),
                                        child: Text(
                                          ((convo.userName != null &&
                                                      convo.userName!
                                                          .trim()
                                                          .isNotEmpty)
                                                  ? convo.userName!.trim()[0]
                                                  : 'S')
                                              .toUpperCase(),
                                          style: const TextStyle(
                                            color: Color(0xFFFFB703),
                                            fontWeight: FontWeight.w900,
                                            fontSize: 17,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Row(
                                              mainAxisAlignment:
                                                  MainAxisAlignment
                                                      .spaceBetween,
                                              children: [
                                                Expanded(
                                                  child: Text(
                                                    convo.userName ??
                                                        'Student Inquiry',
                                                    style: const TextStyle(
                                                      color: Colors.white,
                                                      fontWeight:
                                                          FontWeight.w800,
                                                      fontSize: 15,
                                                    ),
                                                    overflow:
                                                        TextOverflow.ellipsis,
                                                  ),
                                                ),
                                                Text(
                                                  DateFormat('hh:mm a').format(
                                                    convo.updatedAt.toLocal(),
                                                  ),
                                                  style: const TextStyle(
                                                    color: Colors.white38,
                                                    fontSize: 11,
                                                  ),
                                                ),
                                              ],
                                            ),
                                            const SizedBox(height: 3),
                                            Row(
                                              children: [
                                                if (convo.userPhone != null &&
                                                    convo.userPhone!.isNotEmpty)
                                                  Text(
                                                    '☎ +91 ${convo.userPhone!}',
                                                    style: const TextStyle(
                                                      color: Color(0xFF38BDF8),
                                                      fontSize: 12,
                                                      fontWeight:
                                                          FontWeight.w600,
                                                    ),
                                                  ),
                                                if (convo.orderId != null &&
                                                    convo.orderId!
                                                        .isNotEmpty) ...[
                                                  const SizedBox(width: 8),
                                                  Container(
                                                    padding: const EdgeInsets
                                                        .symmetric(
                                                      horizontal: 6,
                                                      vertical: 2,
                                                    ),
                                                    decoration: BoxDecoration(
                                                      color: const Color(
                                                        0xFF2874F0,
                                                      ).withValues(alpha: 0.2),
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                        6,
                                                      ),
                                                    ),
                                                    child: Text(
                                                      '📦 #${convo.orderId}',
                                                      style: const TextStyle(
                                                        color:
                                                            Color(0xFF60A5FA),
                                                        fontSize: 10.5,
                                                        fontWeight:
                                                            FontWeight.w800,
                                                      ),
                                                    ),
                                                  ),
                                                ],
                                              ],
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 10),

                                  if (isActive) ...[
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 6,
                                      ),
                                      decoration: BoxDecoration(
                                        color: isMine
                                            ? const Color(0xFF10B981)
                                                .withValues(alpha: 0.12)
                                            : Colors.redAccent
                                                .withValues(alpha: 0.12),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Row(
                                        children: [
                                          Icon(
                                            isMine
                                                ? Icons.headset_mic
                                                : Icons.lock_outline,
                                            size: 14,
                                            color: isMine
                                                ? const Color(0xFF10B981)
                                                : Colors.amberAccent,
                                          ),
                                          const SizedBox(width: 6),
                                          Expanded(
                                            child: Text(
                                              isMine
                                                  ? 'Active — Handled by You (${convo.assignedAdminName ?? "Admin"})'
                                                  : '🔒 Locked — Accepted by ${convo.assignedAdminName ?? "Another Admin"}',
                                              style: TextStyle(
                                                color: isMine
                                                    ? const Color(0xFF10B981)
                                                    : Colors.amberAccent,
                                                fontSize: 11.5,
                                                fontWeight: FontWeight.w800,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ] else if (isResolved) ...[
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        const Text(
                                          '✓ Chat Ended & Resolved',
                                          style: TextStyle(
                                            color: Colors.white54,
                                            fontSize: 11.5,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                        if (convo.rating != null)
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 8,
                                              vertical: 2,
                                            ),
                                            decoration: BoxDecoration(
                                              color: const Color(0xFFFFB703)
                                                  .withValues(alpha: 0.15),
                                              borderRadius:
                                                  BorderRadius.circular(10),
                                            ),
                                            child: Text(
                                              '⭐ ${convo.rating}/5',
                                              style: const TextStyle(
                                                color: Color(0xFFFFB703),
                                                fontSize: 11,
                                                fontWeight: FontWeight.w900,
                                              ),
                                            ),
                                          ),
                                      ],
                                    ),
                                  ],

                                  if (isWaiting) ...[
                                    const SizedBox(height: 4),
                                    SizedBox(
                                      width: double.infinity,
                                      height: 42,
                                      child: ElevatedButton.icon(
                                        onPressed: isClaiming
                                            ? null
                                            : () => _handleAcceptChat(convo),
                                        style: ElevatedButton.styleFrom(
                                          backgroundColor:
                                              const Color(0xFF10B981),
                                          foregroundColor: Colors.white,
                                          shape: RoundedRectangleBorder(
                                            borderRadius:
                                                BorderRadius.circular(11),
                                          ),
                                        ),
                                        icon: isClaiming
                                            ? const SizedBox(
                                                width: 16,
                                                height: 16,
                                                child:
                                                    CircularProgressIndicator(
                                                  strokeWidth: 2,
                                                  color: Colors.white,
                                                ),
                                              )
                                            : const Icon(
                                                Icons.headset_mic,
                                                size: 17,
                                              ),
                                        label: Text(
                                          isClaiming
                                              ? 'Accepting...'
                                              : 'Accept & Talk',
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w900,
                                            fontSize: 13,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
        ),
      ],
    );
  }
}

class _ChatDetailScreen extends StatefulWidget {
  final SupportConversation conversation;
  final String initialAdminId;

  const _ChatDetailScreen({
    required this.conversation,
    required this.initialAdminId,
  });

  @override
  State<_ChatDetailScreen> createState() => _ChatDetailScreenState();
}

class _ChatDetailScreenState extends State<_ChatDetailScreen> {
  final TextEditingController _msgController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  late SupportConversation _convo;
  late String _currentAdminId;
  bool _isLoading = true;
  bool _isSending = false;
  bool _isClaiming = false;
  bool _customerIsTyping = false;
  List<SupportMessage> _messages = [];
  Timer? _chatPollTimer;
  Timer? _typingClearTimer;
  StreamSubscription<Map<String, dynamic>>? _liveChatSub;

  @override
  void initState() {
    super.initState();
    _convo = widget.conversation;
    _currentAdminId = widget.initialAdminId;
    NotificationService.instance.setActiveOpenConversation(_convo.id);

    _loadMessages();

    // Instant Real-Time SSE Stream Listener (<50ms delivery)
    _liveChatSub = NotificationService.instance.liveSupportEvents.listen((ev) {
      if (!mounted) return;
      final type = (ev['type'] ?? '').toString();
      final evConvId =
          (ev['conversationId'] ?? ev['message']?['conversation_id'] ?? '')
              .toString();

      if (evConvId != _convo.id) return;

      if (type == 'TYPING' &&
          (ev['senderType'] ?? '').toString().toUpperCase() == 'CUSTOMER') {
        setState(() => _customerIsTyping = true);
        _typingClearTimer?.cancel();
        _typingClearTimer = Timer(const Duration(seconds: 3), () {
          if (mounted) setState(() => _customerIsTyping = false);
        });
      } else if (type == 'NEW_MESSAGE') {
        setState(() => _customerIsTyping = false);
        final msgText =
            (ev['text'] ?? ev['message']?['text'] ?? '').toString();
        final senderType =
            (ev['senderType'] ?? ev['message']?['sender_type'] ?? 'CUSTOMER')
                .toString();
        final senderName =
            (ev['senderName'] ?? ev['message']?['sender_name'] ?? 'Student')
                .toString();
        final msgId =
            (ev['messageId'] ?? ev['id'] ?? 'live_${DateTime.now().millisecondsSinceEpoch}')
                .toString();

        if (msgText.isNotEmpty) {
          final instantMsg = SupportMessage.fromJson({
            'id': msgId,
            'conversation_id': _convo.id,
            'sender_type': senderType,
            'sender_name': senderName,
            'text': msgText,
            'created_at': ev['timestamp'] ?? DateTime.now().toIso8601String(),
          });
          setState(() {
            final alreadyExists = _messages.any(
              (m) =>
                  m.id == instantMsg.id ||
                  (m.content == instantMsg.content &&
                      m.sender == instantMsg.sender &&
                      DateTime.now().difference(m.createdAt).inSeconds.abs() <
                          5),
            );
            if (!alreadyExists) {
              _messages.add(instantMsg);
            }
          });
          _scrollToBottom();
        }
        _loadMessages(silent: true);
      } else if (type == 'CHAT_CLAIMED' ||
          type == 'CHAT_RESOLVED' ||
          type == 'CONVERSATION_UPDATED') {
        _loadMessages(silent: true);
      }
    });

    // Fast 1.5s delta fallback poll so messages are always instant even if mobile carrier buffers SSE
    _chatPollTimer = Timer.periodic(
      const Duration(milliseconds: 1500),
      (_) => _loadMessages(silent: true),
    );
  }

  @override
  void dispose() {
    NotificationService.instance.setActiveOpenConversation(null);
    _liveChatSub?.cancel();
    _typingClearTimer?.cancel();
    _chatPollTimer?.cancel();
    _scrollController.dispose();
    _msgController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _loadMessages({bool silent = false}) async {
    final res = await ApiService.instance.fetchMessagesWithStatus(_convo.id);
    if (!mounted) return;
    final fetchedMsgs = res['messages'] as List<SupportMessage>;
    final hadLessMessages = fetchedMsgs.length > _messages.length;

    setState(() {
      _messages = fetchedMsgs;
      if (res['conversation'] is SupportConversation) {
        _convo = res['conversation'] as SupportConversation;
      }
      final cid = (res['currentAdminId'] ?? '').toString();
      if (cid.isNotEmpty) {
        _currentAdminId = cid;
      }
      _isLoading = false;
    });

    if (hadLessMessages || !silent) {
      _scrollToBottom();
    }
  }

  Future<void> _claimFromDetail() async {
    if (_isClaiming) return;
    setState(() => _isClaiming = true);
    final res = await ApiService.instance.claimSupportConversation(_convo.id);
    if (!mounted) return;
    setState(() => _isClaiming = false);

    if (res['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✓ Chat accepted! You can now talk with the student.'),
          backgroundColor: Color(0xFF10B981),
        ),
      );
      await _loadMessages(silent: true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '❌ ${res['error'] ?? "Already accepted by another admin."}',
          ),
          backgroundColor: const Color(0xFFEF4444),
        ),
      );
      await _loadMessages(silent: true);
    }
  }

  Future<void> _sendReply([String? presetText]) async {
    final text = (presetText ?? _msgController.text).trim();
    if (text.isEmpty || _isSending) return;

    setState(() {
      _isSending = true;
      // Optimistic 0ms append so admin sees their reply immediately
      _messages.add(
        SupportMessage(
          id: 'temp_${DateTime.now().millisecondsSinceEpoch}',
          conversationId: _convo.id,
          sender: 'admin',
          senderName: ApiService.instance.adminName ?? 'Admin',
          content: text,
          createdAt: DateTime.now(),
        ),
      );
    });
    if (presetText == null) {
      _msgController.clear();
    }
    _scrollToBottom();

    final res = await ApiService.instance.sendSupportReplyResult(
      _convo.id,
      text,
    );

    if (!mounted) return;
    setState(() => _isSending = false);

    if (res['success'] == true) {
      await _loadMessages(silent: true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '❌ ${res['error'] ?? "Failed to send message."}',
          ),
          backgroundColor: const Color(0xFFEF4444),
        ),
      );
      await _loadMessages(silent: true);
    }
  }

  Future<void> _confirmAndEndChat() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0A192F),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: const Text(
          'End & Resolve Chat?',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
        content: const Text(
          'Once ended, this chat session will be closed and neither you nor the student will be able to send further messages in it.',
          style: TextStyle(color: Colors.white70, fontSize: 13.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text(
              'Cancel',
              style: TextStyle(color: Colors.white54),
            ),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'End Chat',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    final res =
        await ApiService.instance.resolveSupportConversationResult(_convo.id);
    if (!mounted) return;
    if (res['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✓ Chat ended and marked as Resolved.'),
          backgroundColor: Color(0xFF10B981),
        ),
      );
      await _loadMessages(silent: true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('❌ ${res['error'] ?? "Failed to end chat."}'),
          backgroundColor: const Color(0xFFEF4444),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusUpper = _convo.status.toUpperCase();
    final isResolved = statusUpper == 'RESOLVED';
    final isWaiting = statusUpper == 'WAITING_ADMIN' || statusUpper == 'BOT';
    final isActive = statusUpper == 'ACTIVE';
    final isAssignedToMe = _convo.isAssignedToMe(_currentAdminId);
    final canChat = isActive && isAssignedToMe;

    return Scaffold(
      backgroundColor: const Color(0xFF001B3A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0A192F),
        foregroundColor: Colors.white,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Flexible(
                  child: Text(
                    _convo.userName ?? 'Student Support',
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 15.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 7,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: isResolved
                        ? Colors.white12
                        : isWaiting
                            ? const Color(0xFFF59E0B).withValues(alpha: 0.2)
                            : const Color(0xFF10B981).withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    isResolved
                        ? 'ENDED'
                        : isWaiting
                            ? 'WAITING'
                            : 'ACTIVE',
                    style: TextStyle(
                      fontSize: 9.5,
                      fontWeight: FontWeight.w900,
                      color: isResolved
                          ? Colors.white60
                          : isWaiting
                              ? const Color(0xFFF59E0B)
                              : const Color(0xFF10B981),
                    ),
                  ),
                ),
              ],
            ),
            if (_convo.userPhone != null && _convo.userPhone!.isNotEmpty)
              Text(
                '☎ +91 ${_convo.userPhone!}',
                style: const TextStyle(
                  fontSize: 11.5,
                  color: Color(0xFFFFB703),
                ),
              ),
          ],
        ),
        actions: [
          if (_convo.userPhone != null && _convo.userPhone!.isNotEmpty)
            IconButton(
              tooltip: 'Call Student',
              icon: const Icon(Icons.phone, color: Color(0xFF10B981), size: 20),
              onPressed: () async {
                final uri = Uri.parse('tel:${_convo.userPhone}');
                if (await canLaunchUrl(uri)) {
                  await launchUrl(uri);
                }
              },
            ),
          if (canChat)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: TextButton.icon(
                onPressed: _confirmAndEndChat,
                style: TextButton.styleFrom(
                  backgroundColor:
                      const Color(0xFFEF4444).withValues(alpha: 0.16),
                  foregroundColor: const Color(0xFFF87171),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                icon: const Icon(Icons.stop_circle_outlined, size: 16),
                label: const Text(
                  'End Chat',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900),
                ),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          // Messages Feed
          Expanded(
            child: _isLoading
                ? const Center(
                    child: CircularProgressIndicator(color: Color(0xFFFFB703)),
                  )
                : _messages.isEmpty
                    ? const Center(
                        child: Text(
                          'No messages in this conversation yet.',
                          style: TextStyle(color: Colors.white54),
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(16),
                        itemCount: _messages.length,
                        itemBuilder: (context, index) {
                          final msg = _messages[index];
                          final isAdmin = msg.sender == 'admin';
                          final isSystem = msg.sender == 'system';

                          if (isSystem) {
                            return Center(
                              child: Container(
                                margin: const EdgeInsets.symmetric(vertical: 8),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFFB703)
                                      .withValues(alpha: 0.14),
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(
                                    color: const Color(0xFFFFB703)
                                        .withValues(alpha: 0.35),
                                  ),
                                ),
                                child: Text(
                                  msg.content,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    color: Color(0xFFFFB703),
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                            );
                          }

                          return Align(
                            alignment: isAdmin
                                ? Alignment.centerRight
                                : Alignment.centerLeft,
                            child: Column(
                              crossAxisAlignment: isAdmin
                                  ? CrossAxisAlignment.end
                                  : CrossAxisAlignment.start,
                              children: [
                                Padding(
                                  padding: const EdgeInsets.only(
                                    left: 4,
                                    right: 4,
                                    bottom: 3,
                                  ),
                                  child: Text(
                                    msg.senderName,
                                    style: const TextStyle(
                                      color: Colors.white54,
                                      fontSize: 10.5,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                Container(
                                  margin: const EdgeInsets.only(bottom: 10),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 10,
                                  ),
                                  constraints: BoxConstraints(
                                    maxWidth:
                                        MediaQuery.of(context).size.width *
                                            0.78,
                                  ),
                                  decoration: BoxDecoration(
                                    color: isAdmin
                                        ? const Color(0xFFFFB703)
                                        : const Color(0xFF112240),
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        msg.content,
                                        style: TextStyle(
                                          color: isAdmin
                                              ? const Color(0xFF001B3A)
                                              : Colors.white,
                                          fontWeight: isAdmin
                                              ? FontWeight.w700
                                              : FontWeight.w500,
                                          fontSize: 14,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        DateFormat('hh:mm a')
                                            .format(msg.createdAt.toLocal()),
                                        style: TextStyle(
                                          color: isAdmin
                                              ? const Color(0xFF001B3A)
                                                  .withValues(alpha: 0.6)
                                              : Colors.white38,
                                          fontSize: 10,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
          ),

          // Live Customer Typing Indicator
          if (_customerIsTyping && !isResolved)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              color: const Color(0xFFFFB703).withValues(alpha: 0.14),
              child: Text(
                '💬 ${_convo.userName ?? "Student"} is typing...',
                style: const TextStyle(
                  color: Color(0xFFFFB703),
                  fontSize: 11.5,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),

          // Quick Canned Replies Toolbar (Only when Active & Assigned to Me)
          if (canChat)
            Container(
              height: 42,
              padding: const EdgeInsets.symmetric(vertical: 5),
              decoration: const BoxDecoration(
                color: Color(0xFF0A192F),
                border: Border(top: BorderSide(color: Colors.white10)),
              ),
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                scrollDirection: Axis.horizontal,
                itemCount: _kCannedReplies.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, idx) {
                  final reply = _kCannedReplies[idx];
                  return ActionChip(
                    backgroundColor: const Color(0xFF112240),
                    side: const BorderSide(color: Colors.white12),
                    label: Text(
                      reply.length > 32
                          ? '${reply.substring(0, 32)}...'
                          : reply,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    onPressed: () => _sendReply(reply),
                  );
                },
              ),
            ),

          // Bottom Action / Input Area Based on Strict Lock & Ended State
          Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 16),
            decoration: const BoxDecoration(
              color: Color(0xFF0A192F),
              border: Border(top: BorderSide(color: Colors.white10)),
            ),
            child: SafeArea(
              top: false,
              child: isResolved
                  ? Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.white12),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.lock_clock,
                            color: Colors.white54,
                            size: 18,
                          ),
                          SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              'Chat Ended — This session is closed and no further messages can be sent.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Colors.white60,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    )
                  : isWaiting
                      ? SizedBox(
                          width: double.infinity,
                          height: 48,
                          child: ElevatedButton.icon(
                            onPressed: _isClaiming ? null : _claimFromDetail,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF10B981),
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                            icon: _isClaiming
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Icon(Icons.headset_mic),
                            label: Text(
                              _isClaiming
                                  ? 'Accepting Chat...'
                                  : 'Accept Chat to Start Talking',
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        )
                      : !isAssignedToMe
                          ? Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF59E0B)
                                    .withValues(alpha: 0.14),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: const Color(0xFFF59E0B)
                                      .withValues(alpha: 0.4),
                                ),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Icon(
                                    Icons.lock,
                                    color: Color(0xFFFFB703),
                                    size: 18,
                                  ),
                                  const SizedBox(width: 8),
                                  Flexible(
                                    child: Text(
                                      'Handled by ${_convo.assignedAdminName ?? "Another Admin"} — Only one admin can chat at a time (View Only).',
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                        color: Color(0xFFFFB703),
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: _msgController,
                                    style: const TextStyle(color: Colors.white),
                                    decoration: InputDecoration(
                                      hintText: 'Write a reply to student...',
                                      hintStyle: const TextStyle(
                                        color: Colors.white38,
                                      ),
                                      filled: true,
                                      fillColor: const Color(0xFF112240),
                                      contentPadding:
                                          const EdgeInsets.symmetric(
                                        horizontal: 16,
                                        vertical: 12,
                                      ),
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(24),
                                        borderSide: BorderSide.none,
                                      ),
                                    ),
                                    onSubmitted: (_) => _sendReply(),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                CircleAvatar(
                                  radius: 24,
                                  backgroundColor: const Color(0xFFFFB703),
                                  child: IconButton(
                                    icon: _isSending
                                        ? const SizedBox(
                                            width: 18,
                                            height: 18,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                              color: Color(0xFF001B3A),
                                            ),
                                          )
                                        : const Icon(
                                            Icons.send,
                                            color: Color(0xFF001B3A),
                                            size: 20,
                                          ),
                                    onPressed: () => _sendReply(),
                                  ),
                                ),
                              ],
                            ),
            ),
          ),
        ],
      ),
    );
  }
}
