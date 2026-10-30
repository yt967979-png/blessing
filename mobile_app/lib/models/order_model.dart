import 'dart:convert';

class OrderItem {
  final String title;
  final int qty;
  final int price;
  final int subtotal;
  final String? medium;
  final int mrp;

  OrderItem({
    required this.title,
    required this.qty,
    required this.price,
    required this.subtotal,
    this.medium,
    required this.mrp,
  });

  factory OrderItem.fromJson(Map<String, dynamic> json) {
    final p = (json['price'] ?? json['book_price'] ?? 0);
    final q = (json['qty'] ?? json['quantity'] ?? 1);
    final s = (json['subtotal'] ?? 0);
    final m = (json['mrp'] ?? p ?? 0);
    return OrderItem(
      title: (json['title'] ?? json['book_title'] ?? 'Study Guide').toString(),
      qty: q is int ? q : (q as num).toInt(),
      price: p is int ? p : (p as num).toInt(),
      subtotal: s is int ? s : (s as num).toInt(),
      medium: json['medium']?.toString(),
      mrp: m is int ? m : (m as num).toInt(),
    );
  }
}

class AdminOrder {
  final String id;
  final String orderNumber;
  final String status;
  final String? awbNumber;
  final String? courierName;
  final String? trackingUrl;
  final int totalAmount;
  final String paymentMethod;
  final String paymentStatus;
  final String? studentName;
  final String? phone;
  final String? city;
  final String? state;
  final String? pincode;
  final String? address;
  final DateTime? orderedAt;
  final DateTime? shippedAt;
  final List<OrderItem> items;

  AdminOrder({
    required this.id,
    required this.orderNumber,
    required this.status,
    this.awbNumber,
    this.courierName,
    this.trackingUrl,
    required this.totalAmount,
    required this.paymentMethod,
    required this.paymentStatus,
    this.studentName,
    this.phone,
    this.city,
    this.state,
    this.pincode,
    this.address,
    this.orderedAt,
    this.shippedAt,
    required this.items,
  });

  factory AdminOrder.fromJson(Map<String, dynamic> json) {
    String? sName;
    String? sPhone;
    String? sCity;
    String? sState;
    String? sPin;
    String? sAddr;

    final addrRaw = json['shipping_address'] ?? json['customer'];
    Map<String, dynamic>? addrMap;
    if (addrRaw is Map<String, dynamic>) {
      addrMap = addrRaw;
    } else if (addrRaw is String && addrRaw.trim().startsWith('{')) {
      try {
        final decoded = jsonDecode(addrRaw);
        if (decoded is Map<String, dynamic>) {
          addrMap = decoded;
        }
      } catch (_) {}
    }

    if (addrMap != null) {
      sName = (addrMap['name'] ?? addrMap['fullName'] ?? addrMap['studentName'])?.toString();
      sPhone = (addrMap['phone'] ?? addrMap['mobile'])?.toString();
      sCity = addrMap['city']?.toString();
      sState = addrMap['state']?.toString();
      sPin = addrMap['pincode']?.toString();
      sAddr = (addrMap['address'] ?? addrMap['street'])?.toString();
    }

    List<OrderItem> itemList = [];
    if (json['items'] is List) {
      itemList = (json['items'] as List)
          .whereType<Map<String, dynamic>>()
          .map((i) => OrderItem.fromJson(i))
          .toList();
    }

    DateTime? oDate;
    final rawOrderedAt = json['ordered_at'] ?? json['placedAt'] ?? json['orderedAt'];
    if (rawOrderedAt != null) {
      try {
        oDate = DateTime.parse(rawOrderedAt.toString());
      } catch (_) {}
    }

    DateTime? sDate;
    final rawShippedAt = json['shipped_at'] ?? json['shippedAt'];
    if (rawShippedAt != null) {
      try {
        sDate = DateTime.parse(rawShippedAt.toString());
      } catch (_) {}
    }

    final rawTotal = json['total_amount'] ?? json['totalAmount'] ?? 0;
    final parsedTotal = rawTotal is int
        ? rawTotal
        : (rawTotal is num ? rawTotal.toInt() : int.tryParse(rawTotal.toString()) ?? 0);

    return AdminOrder(
      id: (json['id'] ?? json['orderId'] ?? '').toString(),
      orderNumber: (json['order_number'] ??
              json['orderNumber'] ??
              json['orderId'] ??
              json['id'] ??
              '')
          .toString(),
      status: (json['order_status'] ??
              json['orderStatus'] ??
              json['courierStatus'] ??
              json['status'] ??
              'Confirmed')
          .toString(),
      awbNumber: (json['awb_number'] ??
              json['awbNumber'] ??
              json['trackingNumber'] ??
              json['awb'])
          ?.toString(),
      courierName: (json['courier_name'] ??
              json['courierName'] ??
              'ST Courier Express')
          .toString(),
      trackingUrl: (json['tracking_url'] ?? json['trackingUrl'])?.toString(),
      totalAmount: parsedTotal,
      paymentMethod: (json['payment_method'] ??
              json['paymentMethod'] ??
              'Online UPI')
          .toString(),
      paymentStatus: (json['payment_status'] ??
              json['paymentStatus'] ??
              'Paid')
          .toString(),
      studentName: sName ??
          (json['studentName'] ?? json['customerName'] ?? 'Student').toString(),
      phone: sPhone ??
          (json['phone'] ?? json['customerPhone'] ?? '').toString(),
      city: sCity ?? (json['city'] ?? '').toString(),
      state: sState ?? (json['state'] ?? 'Tamil Nadu').toString(),
      pincode: sPin ?? (json['pincode'] ?? '').toString(),
      address: sAddr ??
          (json['address'] ?? json['street'] ?? '').toString(),
      orderedAt: oDate,
      shippedAt: sDate,
      items: itemList,
    );
  }

  String get itemsSummary {
    if (items.isEmpty) return 'School Study Guides';
    return items.map((i) => '${i.title} (${i.qty})').join(', ');
  }
}
