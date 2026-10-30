import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/order_model.dart';
import '../services/api_service.dart';

const Color _kEmerald = Color(0xFF10B981);

final RegExp _validDocketRegex =
    RegExp(r'^(STC[0-9]{9}|STCOE[0-9]{7,10}|[A-Z]{2,3}[0-9]{8,12}|[0-9]{10,13})$');

String _cleanScannedCode(String raw) {
  var s = raw.trim();
  if (s.contains('docket=')) {
    final m = RegExp(r'docket=([A-Z0-9]+)', caseSensitive: false).firstMatch(s);
    if (m != null) s = m.group(1)!;
  } else if (s.contains('awb=')) {
    final m = RegExp(r'awb=([A-Z0-9]+)', caseSensitive: false).firstMatch(s);
    if (m != null) s = m.group(1)!;
  } else if (s.contains('orderId=')) {
    final m = RegExp(r'orderId=([^&]+)', caseSensitive: false).firstMatch(s);
    if (m != null) s = m.group(1)!;
  }
  return s.replaceAll(RegExp(r'\s+'), '').toUpperCase();
}

bool _isOrderCode(String raw) {
  final c = _cleanScannedCode(raw);
  return c.startsWith('BPG') ||
      c.startsWith('ORD') ||
      c.contains('-') ||
      (c.length >= 8 &&
          !RegExp(r'^[0-9]+$').hasMatch(c) &&
          !c.startsWith('STC') &&
          !c.startsWith('TN'));
}

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  final MobileScannerController _cameraController = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing: CameraFacing.back,
    torchEnabled: false,
  );

  int _step = 1; // 1: Order, 2: AWB, 3: Dispatched
  AdminOrder? _activeOrder;
  Map<String, dynamic>? _dispatchResult;
  bool _isLoading = false;
  String? _errorMessage;
  bool _torchOn = false;
  int _dispatchedSessionCount = 0;
  DateTime _lastScanTime = DateTime.now();

  @override
  void dispose() {
    _cameraController.dispose();
    super.dispose();
  }

  void _triggerHaptic(String type) {
    if (type == 'success') {
      HapticFeedback.heavyImpact();
    } else {
      HapticFeedback.vibrate();
    }
  }

  Future<void> _handleBarcodeDetected(BarcodeCapture capture) async {
    final barcodes = capture.barcodes;
    if (barcodes.isEmpty || _isLoading || _step == 3) return;

    final raw = barcodes.first.rawValue;
    if (raw == null || raw.trim().isEmpty) return;

    final now = DateTime.now();
    if (now.difference(_lastScanTime).inMilliseconds < 1500) return;
    _lastScanTime = now;

    if (_step == 1) {
      await _processOrderLookup(raw);
    } else if (_step == 2) {
      await _processAwbDispatch(raw);
    }
  }

  Future<void> _processOrderLookup(String rawCode) async {
    final code = _cleanScannedCode(rawCode);
    if (code.isEmpty) return;

    if (_validDocketRegex.hasMatch(code) &&
        !code.startsWith('BPG') &&
        !code.startsWith('ORD')) {
      _triggerHaptic('error');
      setState(() {
        _errorMessage =
            '⚠️ "$code" looks like an ST Courier AWB. Step 1 requires the Box Label barcode!';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final res = await ApiService.instance.lookupOrder(code);
    setState(() => _isLoading = false);

    if (res['success'] == true) {
      _triggerHaptic('success');
      setState(() {
        _activeOrder = res['order'] as AdminOrder;
        _step = 2;
      });
    } else {
      _triggerHaptic('error');
      setState(() {
        _errorMessage =
            res['error'] ?? 'Order not found. Please verify box barcode.';
      });
    }
  }

  Future<void> _processAwbDispatch(String rawAwb, {bool force = false}) async {
    if (_activeOrder == null) return;
    final awb = _cleanScannedCode(rawAwb);
    if (awb.isEmpty) return;

    if (awb == _activeOrder!.orderNumber.toUpperCase() ||
        awb == _activeOrder!.id.toUpperCase() ||
        _isOrderCode(awb)) {
      _triggerHaptic('error');
      setState(() {
        _errorMessage =
            '⚠️ Scanned barcode is an Order ID, NOT an ST Courier docket! Please scan the courier sticker.';
      });
      return;
    }

    if ((awb.length == 13 &&
            (awb.startsWith('978') ||
                awb.startsWith('979') ||
                awb.startsWith('890'))) ||
        RegExp(r'^(\d)\1{6,}$').hasMatch(awb) ||
        awb.contains('12345678')) {
      _triggerHaptic('error');
      setState(() {
        _errorMessage =
            '⚠️ "$awb" is a Book ISBN / Product barcode or fake number, NOT an ST Courier docket!';
      });
      return;
    }

    if (!_validDocketRegex.hasMatch(awb)) {
      _triggerHaptic('error');
      setState(() {
        _errorMessage =
            '⚠️ "$awb" is not a valid ST Courier docket format. ST Courier AWBs are 10–13 digits (e.g. 63660535761).';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final res = await ApiService.instance.scanDispatch(
      orderId: _activeOrder!.orderNumber,
      awbNumber: awb,
      force: force,
    );
    setState(() => _isLoading = false);

    if (res['success'] == true) {
      _triggerHaptic('success');
      setState(() {
        _dispatchResult = {
          'orderNumber': _activeOrder!.orderNumber,
          'studentName': _activeOrder!.studentName ?? 'Student',
          'destination': _activeOrder!.city ?? 'Tamil Nadu',
          'awbNumber': awb,
          'stCourierUrl': res['stCourierUrl'] ??
              'https://stcourier.com/track/shipment?docket=$awb',
          'whatsAppShareUrl': res['whatsAppShareUrl'],
        };
        _dispatchedSessionCount++;
        _step = 3;
      });
    } else {
      _triggerHaptic('error');
      if (res['requiresForce'] == true && mounted) {
        final confirmOverwrite = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: const Color(0xFF0A192F),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
            title: const Text(
              'Overwrite Existing AWB?',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
              ),
            ),
            content: Text(
              '${res['error'] ?? "This order already has an AWB assigned."}\n\nDo you want to replace it with new AWB "$awb"?',
              style: const TextStyle(color: Colors.white70, fontSize: 13.5),
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
                  backgroundColor: const Color(0xFFFFB703),
                  foregroundColor: const Color(0xFF001B3A),
                ),
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text(
                  'Replace AWB',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
        );
        if (confirmOverwrite == true) {
          await _processAwbDispatch(awb, force: true);
          return;
        }
      }
      setState(() {
        _errorMessage = res['error'] ?? 'Failed to dispatch order.';
      });
    }
  }

  void _resetForNextParcel() {
    setState(() {
      _step = 1;
      _activeOrder = null;
      _dispatchResult = null;
      _errorMessage = null;
    });
  }

  void _showManualModal() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        final ctrl = TextEditingController();
        return Container(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          decoration: const BoxDecoration(
            color: Color(0xFF0F172A),
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.keyboard,
                        color: Color(0xFFFFB703),
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _step == 1 || _activeOrder == null
                            ? 'Step 1: Enter Order ID'
                            : 'Step 2: Enter ST Courier AWB',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(ctx),
                    icon: const Icon(
                      Icons.close,
                      color: Colors.white54,
                      size: 20,
                    ),
                  ),
                ],
              ),
              const Divider(color: Colors.white12),
              const SizedBox(height: 10),

              if (_step == 1 || _activeOrder == null) ...[
                const Text(
                  'Type or paste the Order ID from the shipping label:',
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: ctrl,
                  autofocus: true,
                  textCapitalization: TextCapitalization.characters,
                  style: const TextStyle(
                    color: Colors.cyanAccent,
                    fontWeight: FontWeight.bold,
                  ),
                  decoration: InputDecoration(
                    hintText: 'e.g. BPG-EYP4GX0P or 1049',
                    hintStyle: const TextStyle(color: Colors.white30),
                    filled: true,
                    fillColor: const Color(0xFF1E293B),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2874F0),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: () {
                      final val = ctrl.text.trim();
                      if (val.isNotEmpty) {
                        Navigator.pop(ctx);
                        _processOrderLookup(val);
                      }
                    },
                    child: const Text(
                      'Find & Lock Order →',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ],

              if (_step == 2 && _activeOrder != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: const Color(0xFFFFB703).withValues(alpha: 0.4),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Locked: #${_activeOrder!.orderNumber}',
                            style: const TextStyle(
                              color: Color(0xFFFFB703),
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white12,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              _activeOrder!.status,
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 10,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${_activeOrder!.studentName} · ${_activeOrder!.city}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                        ),
                      ),
                      Text(
                        '📚 ${_activeOrder!.itemsSummary}',
                        style: const TextStyle(
                          color: Colors.white54,
                          fontSize: 11,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Enter 10-13 digit ST Courier Docket Number:',
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: ctrl,
                  autofocus: true,
                  textCapitalization: TextCapitalization.characters,
                  style: const TextStyle(
                    color: Color(0xFFFFB703),
                    fontWeight: FontWeight.bold,
                  ),
                  decoration: InputDecoration(
                    hintText: 'e.g. 63660535761 or STC...',
                    hintStyle: const TextStyle(color: Colors.white30),
                    filled: true,
                    fillColor: const Color(0xFF1E293B),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white70,
                          side: const BorderSide(color: Colors.white24),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        onPressed: () {
                          Navigator.pop(ctx);
                          _resetForNextParcel();
                        },
                        child: const Text('Change Order'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFFFB703),
                          foregroundColor: const Color(0xFF001B3A),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        onPressed: () {
                          final val = ctrl.text.trim();
                          if (val.isNotEmpty) {
                            Navigator.pop(ctx);
                            _processAwbDispatch(val);
                          }
                        },
                        child: const Text(
                          'Assign & Dispatch',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text(
                  'QUICK DISPATCH SCANNER',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                if (_dispatchedSessionCount > 0) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: _kEmerald.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: _kEmerald.withValues(alpha: 0.4),
                      ),
                    ),
                    child: Text(
                      '✓ $_dispatchedSessionCount',
                      style: const TextStyle(
                        color: _kEmerald,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ],
            ),
            Text(
              _step == 1
                  ? 'Step 1/2: Point at Box Shipping Label Barcode'
                  : _step == 2
                      ? 'Step 2/2: Point at ST Courier Docket Sticker'
                      : 'Parcel Dispatched Successfully!',
              style: TextStyle(
                color: _step == 1
                    ? Colors.cyanAccent
                    : _step == 2
                        ? const Color(0xFFFFB703)
                        : _kEmerald,
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: Icon(
              _torchOn ? Icons.flash_on : Icons.flash_off,
              color: _torchOn ? const Color(0xFFFFB703) : Colors.white70,
            ),
            onPressed: () {
              setState(() => _torchOn = !_torchOn);
              _cameraController.toggleTorch();
            },
            tooltip: 'Flashlight',
          ),
          IconButton(
            icon: const Icon(Icons.keyboard, color: Colors.white70),
            onPressed: _showManualModal,
            tooltip: 'Manual Entry',
          ),
        ],
      ),
      body: Stack(
        children: [
          MobileScanner(
            controller: _cameraController,
            onDetect: _handleBarcodeDetected,
          ),

          Center(
            child: Container(
              width: 280,
              height: 200,
              decoration: BoxDecoration(
                border: Border.all(
                  color: _step == 1
                      ? Colors.cyanAccent.withValues(alpha: 0.8)
                      : _step == 2
                          ? const Color(0xFFFFB703).withValues(alpha: 0.9)
                          : _kEmerald,
                  width: 2.5,
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: (_step == 1 ? Colors.cyan : const Color(0xFFFFB703))
                        .withValues(alpha: 0.25),
                    blurRadius: 20,
                  ),
                ],
              ),
              child: Stack(
                children: [
                  Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black87,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white24),
                      ),
                      child: Text(
                        _step == 1
                            ? '📦 Align Shipping Label'
                            : _step == 2
                                ? '🏷️ Align ST Courier Docket'
                                : '✓ Dispatched',
                        style: TextStyle(
                          color: _step == 1
                              ? Colors.cyanAccent
                              : const Color(0xFFFFB703),
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          if (_errorMessage != null)
            Positioned(
              top: 16,
              left: 16,
              right: 16,
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade900.withValues(alpha: 0.95),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.redAccent),
                  boxShadow: const [
                    BoxShadow(color: Colors.black45, blurRadius: 10),
                  ],
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.warning_amber_rounded,
                      color: Color(0xFFFFB703),
                      size: 22,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _errorMessage!,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(
                        Icons.close,
                        color: Colors.white70,
                        size: 18,
                      ),
                      onPressed: () => setState(() => _errorMessage = null),
                    ),
                  ],
                ),
              ),
            ),

          if (_isLoading)
            Container(
              color: Colors.black54,
              child: const Center(
                child: CircularProgressIndicator(color: Color(0xFFFFB703)),
              ),
            ),

          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(
                color: Color(0xFF0F172A),
                border: Border(top: BorderSide(color: Colors.white12)),
              ),
              child: SafeArea(
                top: false,
                child: _buildBottomTrayContent(),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomTrayContent() {
    if (_step == 1) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Row(
            children: [
              Icon(
                Icons.inventory_2_outlined,
                color: Colors.cyanAccent,
                size: 26,
              ),
              SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Ready to Pack & Ship',
                    style: TextStyle(color: Colors.white70, fontSize: 11),
                  ),
                  Text(
                    'Scan Shipping Label Barcode',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ],
          ),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.cyanAccent,
              side: const BorderSide(color: Colors.cyanAccent),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            onPressed: _showManualModal,
            icon: const Icon(Icons.keyboard, size: 16),
            label: const Text('Type ID', style: TextStyle(fontSize: 12)),
          ),
        ],
      );
    } else if (_step == 2 && _activeOrder != null) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              const Icon(
                Icons.check_circle,
                color: Color(0xFFFFB703),
                size: 28,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '#${_activeOrder!.orderNumber} · ${_activeOrder!.studentName}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                    Text(
                      '${_activeOrder!.city} · ${_activeOrder!.itemsSummary}',
                      style: const TextStyle(
                        color: Colors.white60,
                        fontSize: 11,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: _resetForNextParcel,
                child: const Text(
                  'Cancel',
                  style: TextStyle(color: Colors.white54, fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
            decoration: BoxDecoration(
              color: const Color(0xFFFFB703).withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: const Color(0xFFFFB703).withValues(alpha: 0.3),
              ),
            ),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.local_shipping_outlined,
                  color: Color(0xFFFFB703),
                  size: 16,
                ),
                SizedBox(width: 8),
                Text(
                  'Now point camera at the ST Courier AWB docket sticker...',
                  style: TextStyle(
                    color: Color(0xFFFFB703),
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    } else if (_step == 3 && _dispatchResult != null) {
      final res = _dispatchResult!;
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              const Icon(Icons.verified, color: _kEmerald, size: 28),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'DISPATCHED: #${res['orderNumber']}',
                      style: const TextStyle(
                        color: _kEmerald,
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                    Text(
                      'ST Courier AWB: ${res['awbNumber']} (${res['studentName']})',
                      style: const TextStyle(color: Colors.white, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              if (res['whatsAppShareUrl'] != null)
                Expanded(
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF25D366),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    onPressed: () => launchUrl(
                      Uri.parse(res['whatsAppShareUrl']),
                      mode: LaunchMode.externalApplication,
                    ),
                    icon: const Icon(Icons.send, size: 16),
                    label: const Text(
                      'WhatsApp',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2874F0),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  onPressed: _resetForNextParcel,
                  icon: const Icon(Icons.arrow_forward, size: 16),
                  label: const Text(
                    'Next Parcel',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ],
          ),
        ],
      );
    }
    return const SizedBox.shrink();
  }
}
