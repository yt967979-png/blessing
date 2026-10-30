import 'package:flutter_test/flutter_test.dart';
import 'package:blessing_admin/main.dart';

void main() {
  testWidgets('BlessingAdminApp smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const BlessingAdminApp());
    expect(find.textContaining('Blessing'), findsWidgets);
  });
}
