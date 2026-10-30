import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/dashboard_screen.dart';
import 'screens/login_screen.dart';
import 'services/api_service.dart';
import 'services/notification_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Color(0xFF0A192F),
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  runApp(const BlessingAdminApp());
}

class BlessingAdminApp extends StatelessWidget {
  const BlessingAdminApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Blessing Admin',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF001B3A),
        primaryColor: const Color(0xFFFFB703),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFFFB703),
          secondary: Color(0xFF10B981),
          surface: Color(0xFF0A192F),
        ),
        useMaterial3: true,
      ),
      home: const _BootstrapScreen(),
      onGenerateRoute: (_) => MaterialPageRoute(
        builder: (_) => ApiService.instance.isAuthenticated
            ? const DashboardScreen()
            : const LoginScreen(),
      ),
      onUnknownRoute: (_) => MaterialPageRoute(
        builder: (_) => ApiService.instance.isAuthenticated
            ? const DashboardScreen()
            : const LoginScreen(),
      ),
    );
  }
}

class _BootstrapScreen extends StatefulWidget {
  const _BootstrapScreen();

  @override
  State<_BootstrapScreen> createState() => _BootstrapScreenState();
}

class _BootstrapScreenState extends State<_BootstrapScreen> {
  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    try {
      await SystemChrome.setPreferredOrientations([
        DeviceOrientation.portraitUp,
      ]);
    } catch (_) {}

    try {
      await ApiService.instance.init();
    } catch (_) {}

    // Initialize notifications asynchronously after UI is mounted
    Future.delayed(const Duration(milliseconds: 500), () {
      NotificationService.instance.init();
    });

    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => ApiService.instance.isAuthenticated
            ? const DashboardScreen()
            : const LoginScreen(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF001B3A),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipOval(
              child: Image.asset(
                'assets/logo.png',
                width: 96,
                height: 96,
                fit: BoxFit.contain,
              ),
            ),
            const SizedBox(height: 20),
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: Color(0xFFFFB703),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
