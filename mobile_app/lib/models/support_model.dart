class SupportMessage {
  final String id;
  final String conversationId;
  final String sender; // 'user' | 'admin' | 'system' | 'bot'
  final String senderName;
  final String content;
  final DateTime createdAt;

  SupportMessage({
    required this.id,
    required this.conversationId,
    required this.sender,
    required this.senderName,
    required this.content,
    required this.createdAt,
  });

  factory SupportMessage.fromJson(Map<String, dynamic> json) {
    DateTime dt = DateTime.now();
    if (json['created_at'] != null) {
      try {
        dt = DateTime.parse(json['created_at'].toString());
      } catch (_) {}
    }
    final rawSender = (json['sender_type'] ?? json['sender'] ?? 'user')
        .toString()
        .toLowerCase();
    final mappedSender = rawSender.contains('admin')
        ? 'admin'
        : rawSender.contains('system')
            ? 'system'
            : rawSender.contains('bot') || rawSender.contains('ai')
                ? 'bot'
                : 'user';

    final rawName = (json['sender_name'] ?? '').toString().trim();
    final defaultName = mappedSender == 'admin'
        ? 'Admin'
        : mappedSender == 'system'
            ? 'System'
            : mappedSender == 'bot'
                ? 'Blessing AI'
                : 'Student';

    return SupportMessage(
      id: (json['id'] ?? '').toString(),
      conversationId: (json['conversation_id'] ?? json['conversationId'] ?? '')
          .toString(),
      sender: mappedSender,
      senderName: rawName.isNotEmpty ? rawName : defaultName,
      content: (json['text'] ?? json['content'] ?? json['message'] ?? '')
          .toString(),
      createdAt: dt,
    );
  }
}

class SupportConversation {
  final String id;
  final String? userName;
  final String? userPhone;
  final String? orderId;
  final String? lastMessage;
  final String status; // 'WAITING_ADMIN' | 'ACTIVE' | 'RESOLVED'
  final String? assignedAdminId;
  final String? assignedAdminName;
  final int? rating;
  final String? feedbackComment;
  final DateTime updatedAt;
  final int unreadCount;

  SupportConversation({
    required this.id,
    this.userName,
    this.userPhone,
    this.orderId,
    this.lastMessage,
    required this.status,
    this.assignedAdminId,
    this.assignedAdminName,
    this.rating,
    this.feedbackComment,
    required this.updatedAt,
    this.unreadCount = 0,
  });

  bool isAssignedToMe(String currentAdminId) {
    final assigned = (assignedAdminId ?? '').trim();
    if (assigned.isEmpty) return true;
    if (assigned == currentAdminId) return true;
    if (!assigned.contains('::') &&
        currentAdminId.startsWith('$assigned::')) {
      return true;
    }
    return false;
  }

  static String _nonEmpty(List<dynamic> candidates, String fallback) {
    for (final c in candidates) {
      if (c != null) {
        final s = c.toString().trim();
        if (s.isNotEmpty) return s;
      }
    }
    return fallback;
  }

  factory SupportConversation.fromJson(Map<String, dynamic> json) {
    DateTime dt = DateTime.now();
    final rawTime =
        json['last_message_at'] ?? json['updated_at'] ?? json['created_at'];
    if (rawTime != null) {
      try {
        dt = DateTime.parse(rawTime.toString());
      } catch (_) {}
    }

    int? parsedRating;
    if (json['rating'] != null) {
      parsedRating = int.tryParse(json['rating'].toString());
    }

    final rawOrder = _nonEmpty([json['order_id'], json['orderId']], '');
    final rawAssignedId = _nonEmpty(
      [json['assigned_admin_id'], json['assignedAdminId']],
      '',
    );
    final rawAssignedName = _nonEmpty(
      [json['assigned_admin_name'], json['assignedAdminName']],
      '',
    );
    final rawComment = _nonEmpty(
      [json['feedback_comment'], json['comment']],
      '',
    );

    return SupportConversation(
      id: (json['id'] ?? '').toString(),
      userName: _nonEmpty(
        [json['customer_name'], json['user_name'], json['userName']],
        'Student',
      ),
      userPhone: _nonEmpty(
        [json['customer_phone'], json['user_phone'], json['userPhone']],
        '',
      ),
      orderId: rawOrder.isNotEmpty ? rawOrder : null,
      lastMessage: _nonEmpty(
        [
          json['last_message_preview'],
          json['last_message'],
          json['lastMessage'],
          json['subject'],
        ],
        'Student Support Inquiry',
      ),
      status: _nonEmpty([json['status']], 'WAITING_ADMIN').toUpperCase(),
      assignedAdminId: rawAssignedId.isNotEmpty ? rawAssignedId : null,
      assignedAdminName: rawAssignedName.isNotEmpty ? rawAssignedName : null,
      rating: parsedRating,
      feedbackComment: rawComment.isNotEmpty ? rawComment : null,
      updatedAt: dt,
      unreadCount: (json['unread_count'] ?? 0) is int
          ? (json['unread_count'] ?? 0)
          : 0,
    );
  }
}
