import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';
import 'dashboard_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with WidgetsBindingObserver {
  bool _isWaitingForGoogle = false;
  String? _errorMessage;
  String? _activeHandshakeState;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        _activeHandshakeState != null &&
        _isWaitingForGoogle) {
      _checkHandshakeNow();
    }
  }

  Future<void> _checkHandshakeNow() async {
    final st = _activeHandshakeState;
    if (st == null || !mounted) return;
    final res = await ApiService.instance.pollGoogleHandshake(st);
    if (!mounted) return;
    if (res['success'] == true) {
      _pollTimer?.cancel();
      setState(() {
        _isWaitingForGoogle = false;
      });
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const DashboardScreen()),
      );
    } else if (res['error'] != null) {
      _pollTimer?.cancel();
      setState(() {
        _isWaitingForGoogle = false;
        _errorMessage = res['error'].toString();
      });
    }
  }

  Future<void> _handleGoogleOAuthSignIn() async {
    _pollTimer?.cancel();
    final rand = Random.secure();
    final bytes = List<int>.generate(12, (_) => rand.nextInt(256));
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    final state = 'mob_${DateTime.now().millisecondsSinceEpoch}_$hex';

    setState(() {
      _activeHandshakeState = state;
      _isWaitingForGoogle = true;
      _errorMessage = null;
    });

    final authUrl = Uri.parse(
      '${ApiService.baseUrl}/mobile-auth?state=${Uri.encodeComponent(state)}',
    );

    await launchUrl(authUrl, mode: LaunchMode.externalApplication);

    int ticks = 0;
    _pollTimer =
        Timer.periodic(const Duration(milliseconds: 1500), (timer) async {
      ticks++;
      if (ticks > 120 || !mounted) {
        timer.cancel();
        if (mounted) {
          setState(() => _isWaitingForGoogle = false);
        }
        return;
      }
      await _checkHandshakeNow();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF001B3A),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Official Blessing Power Guide BPG Emblem
                Container(
                  width: 132,
                  height: 132,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFFFFB703).withValues(alpha: 0.35),
                        blurRadius: 32,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: ClipOval(
                    child: Image.asset(
                      'assets/logo.png',
                      width: 132,
                      height: 132,
                      fit: BoxFit.contain,
                    ),
                  ),
                ),
                const SizedBox(height: 28),

                const Text(
                  'Blessing Power Guide',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'OPERATIONS & DISPATCH ADMIN HUB',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Color(0xFFFFB703),
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 14),
                const Text(
                  'Sign in with your authorized Administrator Google account to scan parcels, assign ST Courier AWB dockets, and manage student orders.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white60,
                    fontSize: 13.5,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 36),

                // Error Message Banner
                if (_errorMessage != null) ...[
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.red.withValues(alpha: 0.15),
                      border: Border.all(color: Colors.red.shade400),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.error_outline,
                          color: Colors.redAccent,
                          size: 20,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _errorMessage!,
                            style: const TextStyle(
                              color: Colors.redAccent,
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 22),
                ],

                // Single "Continue with Google" Button
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: _handleGoogleOAuthSignIn,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: const Color(0xFF0F172A),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      elevation: 6,
                    ),
                    child: _isWaitingForGoogle
                        ? const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5,
                                  color: Color(0xFF2874F0),
                                ),
                              ),
                              SizedBox(width: 14),
                              Text(
                                'Verifying Google Admin...',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          )
                        : Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Image.network(
                                'https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png',
                                width: 24,
                                height: 24,
                                errorBuilder: (_, _, _) => const Icon(
                                  Icons.account_circle,
                                  color: Color(0xFF2874F0),
                                  size: 24,
                                ),
                              ),
                              const SizedBox(width: 12),
                              const Text(
                                'Continue with Google',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ],
                          ),
                  ),
                ),

                if (_isWaitingForGoogle) ...[
                  const SizedBox(height: 14),
                  TextButton(
                    onPressed: () {
                      _pollTimer?.cancel();
                      setState(() => _isWaitingForGoogle = false);
                    },
                    child: const Text(
                      'Cancel & Try Again',
                      style: TextStyle(
                        color: Colors.white54,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 36),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.08),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.verified_user_outlined,
                        color: Color(0xFFFFB703),
                        size: 20,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Persistent Session: Once signed in, your account stays logged in until you manually sign out.',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.7),
                            fontSize: 11.5,
                            height: 1.35,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
