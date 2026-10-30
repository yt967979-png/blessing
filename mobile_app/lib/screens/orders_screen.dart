import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/order_model.dart';
import '../services/api_service.dart';

class OrdersScreen extends StatefulWidget {
  final VoidCallback? onOpenScanner;

  const OrdersScreen({super.key, this.onOpenScanner});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _selectedStatus = 'All';
  bool _isLoading = true;
  List<AdminOrder> _orders = [];

  final List<String> _statuses = [
    'All',
    'Confirmed',
    'Packed',
    'Dispatched',
    'Delivered',
  ];

  @override
  void initState() {
    super.initState();
    _loadOrders();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadOrders() async {
    setState(() => _isLoading = true);
    final list = await ApiService.instance.fetchOrders(
      status: _selectedStatus == 'All' ? null : _selectedStatus,
      search: _searchController.text.trim(),
    );
    if (!mounted) return;
    setState(() {
      _orders = list;
      _isLoading = false;
    });
  }

  List<AdminOrder> get _filteredOrders {
    final q = _searchController.text.trim().toLowerCase();
    return _orders.where((o) {
      final matchesStatus = _selectedStatus == 'All' ||
          o.status.toLowerCase() == _selectedStatus.toLowerCase() ||
          (_selectedStatus == 'Dispatched' &&
              (o.status.toLowerCase() == 'shipped' ||
                  o.status.toLowerCase() == 'dispatched'));
      if (!matchesStatus) return false;
      if (q.isEmpty) return true;
      return o.orderNumber.toLowerCase().contains(q) ||
          (o.studentName ?? '').toLowerCase().contains(q) ||
          (o.phone ?? '').toLowerCase().contains(q) ||
          (o.awbNumber ?? '').toLowerCase().contains(q) ||
          (o.city ?? '').toLowerCase().contains(q);
    }).toList();
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return const Color(0xFF3B82F6);
      case 'packed':
        return const Color(0xFFF59E0B);
      case 'dispatched':
      case 'shipped':
        return const Color(0xFF8B5CF6);
      case 'delivered':
        return const Color(0xFF10B981);
      case 'cancelled':
        return const Color(0xFFEF4444);
      default:
        return const Color(0xFF64748B);
    }
  }

  Future<void> _shareOnWhatsApp(AdminOrder order) async {
    final cleanPhone = (order.phone ?? '').replaceAll(RegExp(r'\D'), '');
    final formattedPhone = cleanPhone.length == 10 ? '91$cleanPhone' : cleanPhone;
    final trackUrl =
        'https://blessingpowerguide.in/track?orderId=${order.orderNumber}&phone=${cleanPhone.length >= 10 ? cleanPhone.substring(cleanPhone.length - 10) : cleanPhone}';
    final awbText = order.awbNumber != null && order.awbNumber!.isNotEmpty
        ? '\n📦 *ST Courier AWB:* ${order.awbNumber}'
        : '';

    final message =
        'Hello *${order.studentName ?? "Student"}* 👋,\n\n'
        'Your *Blessing Power Guide* order *#${order.orderNumber}* is *${order.status.toUpperCase()}*!$awbText\n'
        '📚 *Books:* ${order.itemsSummary}\n\n'
        '🔍 *Track Live Delivery:*\n$trackUrl\n\n'
        'Thank you for studying with Blessing Power Guide!';

    final uri = Uri.parse(
      'https://wa.me/$formattedPhone?text=${Uri.encodeComponent(message)}',
    );
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _callCustomer(String? phone) async {
    if (phone == null || phone.isEmpty) return;
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  void _showOrderDetailsModal(AdminOrder order) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0A192F),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        final sColor = _statusColor(order.status);
        return DraggableScrollableSheet(
          initialChildSize: 0.78,
          minChildSize: 0.5,
          maxChildSize: 0.94,
          expand: false,
          builder: (_, scrollController) {
            return SingleChildScrollView(
              controller: scrollController,
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 44,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.white24,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '#${order.orderNumber}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.5,
                            ),
                          ),
                          if (order.orderedAt != null)
                            Text(
                              DateFormat('dd MMM yyyy, hh:mm a')
                                  .format(order.orderedAt!.toLocal()),
                              style: const TextStyle(
                                color: Colors.white54,
                                fontSize: 12,
                              ),
                            ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: sColor.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: sColor.withValues(alpha: 0.5)),
                        ),
                        child: Text(
                          order.status.toUpperCase(),
                          style: TextStyle(
                            color: sColor,
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Student & Delivery Address Card
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF112240),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white10),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.location_on,
                              color: Color(0xFFFFB703),
                              size: 18,
                            ),
                            const SizedBox(width: 8),
                            const Text(
                              'DELIVERY ADDRESS',
                              style: TextStyle(
                                color: Color(0xFFFFB703),
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.1,
                              ),
                            ),
                            const Spacer(),
                            if (order.phone != null && order.phone!.isNotEmpty)
                              InkWell(
                                onTap: () => _callCustomer(order.phone),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF10B981)
                                        .withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Row(
                                    children: [
                                      const Icon(
                                        Icons.phone,
                                        color: Color(0xFF10B981),
                                        size: 14,
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        order.phone!,
                                        style: const TextStyle(
                                          color: Color(0xFF10B981),
                                          fontWeight: FontWeight.bold,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text(
                          order.studentName ?? 'Student',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          [
                            if (order.address != null &&
                                order.address!.isNotEmpty)
                              order.address,
                            if (order.city != null && order.city!.isNotEmpty)
                              order.city,
                            if (order.state != null && order.state!.isNotEmpty)
                              order.state,
                            if (order.pincode != null &&
                                order.pincode!.isNotEmpty)
                              'PIN: ${order.pincode}',
                          ].join(', '),
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 13.5,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ST Courier Docket Card
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF112240),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: order.awbNumber != null
                            ? const Color(0xFF10B981).withValues(alpha: 0.4)
                            : Colors.white10,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.local_shipping,
                              color: Color(0xFF38BDF8),
                              size: 18,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              (order.courierName ?? 'ST Courier Express')
                                  .toUpperCase(),
                              style: const TextStyle(
                                color: Color(0xFF38BDF8),
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.1,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        if (order.awbNumber != null &&
                            order.awbNumber!.isNotEmpty)
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Official AWB / Docket Number',
                                    style: TextStyle(
                                      color: Colors.white54,
                                      fontSize: 11,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    order.awbNumber!,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 18,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: 1.2,
                                    ),
                                  ),
                                ],
                              ),
                              IconButton(
                                onPressed: () {
                                  Clipboard.setData(
                                    ClipboardData(text: order.awbNumber!),
                                  );
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('AWB copied to clipboard'),
                                      duration: Duration(seconds: 2),
                                    ),
                                  );
                                },
                                icon: const Icon(
                                  Icons.copy,
                                  color: Color(0xFFFFB703),
                                ),
                                tooltip: 'Copy AWB',
                              ),
                            ],
                          )
                        else
                          const Text(
                            'Not yet dispatched. Use the Barcode Scanner tab to scan the box label and ST Courier sticker.',
                            style: TextStyle(
                              color: Colors.white60,
                              fontSize: 13,
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Ordered Books List
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF112240),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white10),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'ORDERED STUDY GUIDES',
                          style: TextStyle(
                            color: Colors.white54,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.1,
                          ),
                        ),
                        const SizedBox(height: 12),
                        ...order.items.map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Text(
                                    '${item.title} × ${item.qty}',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                Text(
                                  '₹${item.price * item.qty}',
                                  style: const TextStyle(
                                    color: Color(0xFFFFB703),
                                    fontWeight: FontWeight.bold,
                                    fontSize: 14,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const Divider(color: Colors.white12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Total (${order.paymentMethod})',
                              style: const TextStyle(
                                color: Colors.white70,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              '₹${order.totalAmount}',
                              style: const TextStyle(
                                color: Color(0xFF10B981),
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Action Buttons
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () => _shareOnWhatsApp(order),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF10B981),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          icon: const Icon(Icons.share, size: 18),
                          label: const Text(
                            'Send WhatsApp Update',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ),
                      if (order.awbNumber == null ||
                          order.awbNumber!.isEmpty) ...[
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: () {
                              Navigator.pop(ctx);
                              widget.onOpenScanner?.call();
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFFFB703),
                              foregroundColor: const Color(0xFF001B3A),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            icon: const Icon(Icons.qr_code_scanner, size: 18),
                            label: const Text(
                              'Scan & Dispatch',
                              style: TextStyle(fontWeight: FontWeight.w900),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredOrders;

    return Column(
      children: [
        // Search Bar
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            controller: _searchController,
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => _loadOrders(),
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Search Order #, Student, Phone, or AWB...',
              hintStyle: const TextStyle(color: Colors.white38, fontSize: 14),
              prefixIcon: const Icon(Icons.search, color: Color(0xFFFFB703)),
              suffixIcon: _searchController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, color: Colors.white54),
                      onPressed: () {
                        _searchController.clear();
                        setState(() {});
                        _loadOrders();
                      },
                    )
                  : IconButton(
                      icon: const Icon(Icons.refresh, color: Colors.white54),
                      onPressed: _loadOrders,
                    ),
              filled: true,
              fillColor: const Color(0xFF112240),
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Colors.white10),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Colors.white10),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFFFFB703)),
              ),
            ),
          ),
        ),

        // Filter Chips
        SizedBox(
          height: 44,
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            scrollDirection: Axis.horizontal,
            itemCount: _statuses.length,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final status = _statuses[index];
              final isSelected = _selectedStatus == status;
              return ChoiceChip(
                label: Text(status),
                selected: isSelected,
                onSelected: (_) {
                  setState(() => _selectedStatus = status);
                },
                selectedColor: const Color(0xFFFFB703),
                backgroundColor: const Color(0xFF112240),
                labelStyle: TextStyle(
                  color: isSelected ? const Color(0xFF001B3A) : Colors.white70,
                  fontWeight: FontWeight.w800,
                  fontSize: 12.5,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                  side: BorderSide(
                    color: isSelected
                        ? const Color(0xFFFFB703)
                        : Colors.white12,
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),

        // Orders List
        Expanded(
          child: _isLoading
              ? const Center(
                  child: CircularProgressIndicator(color: Color(0xFFFFB703)),
                )
              : filtered.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.inventory_2_outlined,
                            color: Colors.white24,
                            size: 56,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'No $_selectedStatus orders found',
                            style: const TextStyle(
                              color: Colors.white54,
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextButton.icon(
                            onPressed: _loadOrders,
                            icon: const Icon(
                              Icons.refresh,
                              color: Color(0xFFFFB703),
                            ),
                            label: const Text(
                              'Refresh Orders',
                              style: TextStyle(color: Color(0xFFFFB703)),
                            ),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadOrders,
                      color: const Color(0xFFFFB703),
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                        itemCount: filtered.length,
                        itemBuilder: (context, idx) {
                          final order = filtered[idx];
                          final sColor = _statusColor(order.status);

                          return GestureDetector(
                            onTap: () => _showOrderDetailsModal(order),
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 12),
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: const Color(0xFF112240),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: Colors.white10),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(
                                        '#${order.orderNumber}',
                                        style: const TextStyle(
                                          color: Color(0xFFFFB703),
                                          fontWeight: FontWeight.w900,
                                          fontSize: 15,
                                          letterSpacing: 0.4,
                                        ),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 10,
                                          vertical: 4,
                                        ),
                                        decoration: BoxDecoration(
                                          color: sColor.withValues(alpha: 0.16),
                                          borderRadius:
                                              BorderRadius.circular(12),
                                          border: Border.all(
                                            color: sColor.withValues(alpha: 0.4),
                                          ),
                                        ),
                                        child: Text(
                                          order.status.toUpperCase(),
                                          style: TextStyle(
                                            color: sColor,
                                            fontSize: 10.5,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      const Icon(
                                        Icons.person_outline,
                                        color: Colors.white60,
                                        size: 16,
                                      ),
                                      const SizedBox(width: 6),
                                      Expanded(
                                        child: Text(
                                          '${order.studentName ?? "Student"} • ${order.city ?? "Tamil Nadu"}',
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w700,
                                            fontSize: 14,
                                          ),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      Text(
                                        '₹${order.totalAmount}',
                                        style: const TextStyle(
                                          color: Color(0xFF10B981),
                                          fontWeight: FontWeight.w900,
                                          fontSize: 15,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    order.itemsSummary,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: Colors.white60,
                                      fontSize: 12.5,
                                    ),
                                  ),
                                  if (order.awbNumber != null &&
                                      order.awbNumber!.isNotEmpty) ...[
                                    const SizedBox(height: 10),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 6,
                                      ),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF0A192F),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Row(
                                        children: [
                                          const Icon(
                                            Icons.local_shipping_outlined,
                                            color: Color(0xFF38BDF8),
                                            size: 15,
                                          ),
                                          const SizedBox(width: 6),
                                          Expanded(
                                            child: Text(
                                              'ST Courier AWB: ${order.awbNumber}',
                                              style: const TextStyle(
                                                color: Color(0xFF38BDF8),
                                                fontSize: 12,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ),
                                          InkWell(
                                            onTap: () =>
                                                _shareOnWhatsApp(order),
                                            child: const Padding(
                                              padding: EdgeInsets.symmetric(
                                                horizontal: 4,
                                              ),
                                              child: Text(
                                                'WhatsApp ↗',
                                                style: TextStyle(
                                                  color: Color(0xFF10B981),
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.w800,
                                                ),
                                              ),
                                            ),
                                          ),
                                        ],
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

