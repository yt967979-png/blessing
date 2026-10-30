import 'dart:async';
import 'package:flutter/material.dart';
import '../models/order_model.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';
import 'login_screen.dart';
import 'orders_screen.dart';
import 'scanner_screen.dart';
import 'support_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _currentIndex = 0;
  bool _isLoading = true;
  List<AdminOrder> _recentOrders = [];
  int _activeSupportCount = 0;
  Map<String, String>? _activeTopBanner;
  Timer? _bannerDismissTimer;
  StreamSubscription<Map<String, String>>? _bannerSub;
  StreamSubscription<Map<String, dynamic>>? _liveSupportSub;

  @override
  void initState() {
    super.initState();
    NotificationService.instance.startBackgroundSync();
    _loadDashboardData();

    _bannerSub = NotificationService.instance.inAppBannerAlerts.listen((alert) {
      if (!mounted) return;
      _bannerDismissTimer?.cancel();
      setState(() {
        _activeTopBanner = alert;
      });
      _bannerDismissTimer = Timer(const Duration(seconds: 6), () {
        if (mounted) {
          setState(() => _activeTopBanner = null);
        }
      });
    });

    _liveSupportSub =
        NotificationService.instance.liveSupportEvents.listen((_) {
      _refreshSupportCountSilently();
    });
  }

  @override
  void dispose() {
    _bannerDismissTimer?.cancel();
    _bannerSub?.cancel();
    _liveSupportSub?.cancel();
    super.dispose();
  }

  Future<void> _refreshSupportCountSilently() async {
    try {
      final convos = await ApiService.instance.fetchSupportConversations();
      if (!mounted) return;
      setState(() {
        _activeSupportCount = convos
            .where((c) => c.status.toLowerCase() != 'resolved')
            .length;
      });
    } catch (_) {}
  }

  Future<void> _loadDashboardData() async {
    setState(() => _isLoading = true);
    final orders = await ApiService.instance.fetchOrders();
    final convos = await ApiService.instance.fetchSupportConversations();
    if (!mounted) return;
    setState(() {
      _recentOrders = orders;
      _activeSupportCount = convos
          .where((c) => c.status.toLowerCase() != 'resolved')
          .length;
      _isLoading = false;
    });
  }

  Future<void> _confirmAndLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0A192F),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: const Text(
          'Sign Out of Blessing Admin?',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
        content: const Text(
          'Your session stays active permanently unless you sign out here. Do you want to sign out now?',
          style: TextStyle(color: Colors.white70, fontSize: 13.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text(
              'Stay Signed In',
              style: TextStyle(color: Colors.white60),
            ),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'Sign Out',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    NotificationService.instance.stopBackgroundSync();
    await ApiService.instance.logout();
    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  Widget _buildOverviewTab() {
    final totalOrders = _recentOrders.length;
    final pendingDispatch = _recentOrders
        .where(
          (o) =>
              o.status.toLowerCase() == 'confirmed' ||
              o.status.toLowerCase() == 'packed',
        )
        .length;
    final dispatchedCount = _recentOrders
        .where(
          (o) =>
              o.status.toLowerCase() == 'dispatched' ||
              o.status.toLowerCase() == 'shipped' ||
              o.status.toLowerCase() == 'delivered',
        )
        .length;
    final totalRevenue = _recentOrders.fold<int>(
      0,
      (sum, o) => sum + o.totalAmount,
    );

    return RefreshIndicator(
      onRefresh: _loadDashboardData,
      color: const Color(0xFFFFB703),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Welcome Banner
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF112240), Color(0xFF0A192F)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: const Color(0xFFFFB703).withValues(alpha: 0.35),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Row(
                        children: [
                          Icon(
                            Icons.circle,
                            color: Color(0xFF10B981),
                            size: 8,
                          ),
                          SizedBox(width: 6),
                          Text(
                            'DIRECT VPS SYNC ACTIVE',
                            style: TextStyle(
                              color: Color(0xFF10B981),
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.8,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Spacer(),
                    Text(
                      ApiService.instance.adminEmail ?? 'Administrator',
                      style: const TextStyle(
                        color: Colors.white54,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                const Text(
                  'Blessing Operations Hub',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 21,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Scan package barcodes, assign ST Courier AWB dockets, and receive instant order alerts.',
                  style: TextStyle(color: Colors.white60, fontSize: 13),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () => setState(() => _currentIndex = 1),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFFFB703),
                          foregroundColor: const Color(0xFF001B3A),
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        icon: const Icon(Icons.qr_code_scanner, size: 19),
                        label: const Text(
                          'Open Dispatch Scanner',
                          style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Telemetry Grid
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.45,
            children: [
              _statCard(
                title: 'READY TO DISPATCH',
                value: '$pendingDispatch',
                subtitle: 'Confirmed & Packed',
                icon: Icons.inventory_2,
                color: const Color(0xFFF59E0B),
                onTap: () => setState(() => _currentIndex = 2),
              ),
              _statCard(
                title: 'DISPATCHED',
                value: '$dispatchedCount',
                subtitle: 'ST Courier Active',
                icon: Icons.local_shipping,
                color: const Color(0xFF38BDF8),
                onTap: () => setState(() => _currentIndex = 2),
              ),
              _statCard(
                title: 'TOTAL REVENUE',
                value: '₹$totalRevenue',
                subtitle: '$totalOrders Total Orders',
                icon: Icons.currency_rupee,
                color: const Color(0xFF10B981),
                onTap: () => setState(() => _currentIndex = 2),
              ),
              _statCard(
                title: 'SUPPORT CHATS',
                value: '$_activeSupportCount',
                subtitle: 'Open Student Queries',
                icon: Icons.support_agent,
                color: const Color(0xFFA855F7),
                onTap: () => setState(() => _currentIndex = 3),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Recent Orders Section Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'RECENT ORDERS',
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.1,
                ),
              ),
              TextButton(
                onPressed: () => setState(() => _currentIndex = 2),
                child: const Text(
                  'View All →',
                  style: TextStyle(
                    color: Color(0xFFFFB703),
                    fontWeight: FontWeight.w800,
                    fontSize: 12.5,
                  ),
                ),
              ),
            ],
          ),
          if (_isLoading)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(
                child: CircularProgressIndicator(color: Color(0xFFFFB703)),
              ),
            )
          else if (_recentOrders.isEmpty)
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: const Color(0xFF112240),
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Center(
                child: Text(
                  'No recent orders loaded.',
                  style: TextStyle(color: Colors.white54),
                ),
              ),
            )
          else
            ..._recentOrders.take(5).map(
                  (order) => Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFF112240),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Colors.white10),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color:
                                const Color(0xFFFFB703).withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.menu_book,
                            color: Color(0xFFFFB703),
                            size: 20,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '#${order.orderNumber} • ${order.studentName ?? "Student"}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 13.5,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 2),
                              Text(
                                order.awbNumber != null &&
                                        order.awbNumber!.isNotEmpty
                                    ? 'AWB: ${order.awbNumber} (${order.status})'
                                    : '${order.status} • ${order.city ?? "Tamil Nadu"}',
                                style: const TextStyle(
                                  color: Colors.white54,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          '₹${order.totalAmount}',
                          style: const TextStyle(
                            color: Color(0xFF10B981),
                            fontWeight: FontWeight.w900,
                            fontSize: 14,
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

  Widget _statCard({
    required String title,
    required String value,
    required String subtitle,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF112240),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white54,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.6,
                  ),
                ),
                Icon(icon, color: color, size: 18),
              ],
            ),
            Text(
              value,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
            ),
            Text(
              subtitle,
              style: TextStyle(
                color: color,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _buildOverviewTab(),
      const ScannerScreen(),
      OrdersScreen(
        onOpenScanner: () => setState(() => _currentIndex = 1),
      ),
      const SupportScreen(),
    ];

    final titles = [
      'Blessing Admin',
      'Quick Dispatch Scanner',
      'All Orders',
      'Student Support Inbox',
    ];

    return Scaffold(
      backgroundColor: const Color(0xFF001B3A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0A192F),
        elevation: 0,
        title: Row(
          children: [
            ClipOval(
              child: Image.asset(
                'assets/logo.png',
                width: 32,
                height: 32,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 10),
            Text(
              titles[_currentIndex],
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                fontSize: 17,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Test Order Notification Alert',
            icon: const Icon(
              Icons.notifications_active_outlined,
              color: Color(0xFFFFB703),
            ),
            onPressed: () async {
              final status = await NotificationService.instance.showOrderAlert(
                orderNumber: 'BPG-EYP4GX0P',
                studentName: 'Yogesh T',
                amount: 450,
                openSettingsOnFail: true,
              );
              if (!context.mounted) return;
              if (status == 'PERMISSION_DISABLED') {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      '⚠️ Please turn ON "Allow Notifications" in the Android Settings screen that just opened!',
                    ),
                    backgroundColor: Color(0xFFF59E0B),
                    duration: Duration(seconds: 4),
                  ),
                );
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      '⚡ Native Android notification + sound + banner triggered!',
                    ),
                    backgroundColor: Color(0xFF10B981),
                    duration: Duration(seconds: 2),
                  ),
                );
              }
            },
          ),
          IconButton(
            tooltip: 'Sign Out',
            icon: const Icon(Icons.logout, color: Colors.white70),
            onPressed: _confirmAndLogout,
          ),
        ],
      ),
      body: Stack(
        children: [
          Positioned.fill(child: pages[_currentIndex]),
          if (_activeTopBanner != null)
            Positioned(
              top: 10,
              left: 12,
              right: 12,
              child: Material(
                color: Colors.transparent,
                elevation: 14,
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0A192F),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: const Color(0xFFFFB703),
                      width: 1.5,
                    ),
                    boxShadow: const [
                      BoxShadow(
                        color: Colors.black54,
                        blurRadius: 16,
                        offset: Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      ClipOval(
                        child: Image.asset(
                          'assets/logo.png',
                          width: 38,
                          height: 38,
                          fit: BoxFit.cover,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _activeTopBanner!['title'] ?? 'Blessing Alert',
                              style: const TextStyle(
                                color: Color(0xFFFFB703),
                                fontWeight: FontWeight.w900,
                                fontSize: 13,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 3),
                            Text(
                              _activeTopBanner!['body'] ?? '',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                height: 1.25,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      TextButton(
                        style: TextButton.styleFrom(
                          backgroundColor: const Color(0xFFFFB703),
                          foregroundColor: const Color(0xFF001B3A),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          minimumSize: Size.zero,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        onPressed: () {
                          final type = _activeTopBanner?['type'] ?? 'order';
                          setState(() {
                            _activeTopBanner = null;
                            _currentIndex = type == 'support' ? 3 : 2;
                          });
                        },
                        child: Text(
                          (_activeTopBanner?['type'] == 'support')
                              ? 'Open Chat'
                              : 'View',
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 11.5,
                          ),
                        ),
                      ),
                      IconButton(
                        visualDensity: VisualDensity.compact,
                        icon: const Icon(
                          Icons.close,
                          color: Colors.white54,
                          size: 18,
                        ),
                        onPressed: () =>
                            setState(() => _activeTopBanner = null),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Colors.white10)),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (idx) => setState(() => _currentIndex = idx),
          type: BottomNavigationBarType.fixed,
          backgroundColor: const Color(0xFF0A192F),
          selectedItemColor: const Color(0xFFFFB703),
          unselectedItemColor: Colors.white54,
          selectedLabelStyle: const TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: 11.5,
          ),
          unselectedLabelStyle: const TextStyle(
            fontWeight: FontWeight.w600,
            fontSize: 11,
          ),
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.dashboard_outlined),
              activeIcon: Icon(Icons.dashboard),
              label: 'Overview',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.qr_code_scanner),
              activeIcon: Icon(Icons.qr_code_scanner),
              label: 'Scanner',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.inventory_2_outlined),
              activeIcon: Icon(Icons.inventory_2),
              label: 'Orders',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.support_agent_outlined),
              activeIcon: Icon(Icons.support_agent),
              label: 'Support',
            ),
          ],
        ),
      ),
    );
  }
}
