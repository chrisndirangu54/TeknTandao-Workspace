import 'package:flutter_test/flutter_test.dart';
import 'package:tandao_suite/modules/platform_control_center.dart';

void main() {
  test('strategic platform modules route to the shared control center', () {
    for (final id in [
      'mc10_business_process_marketplace',
      'mc11_ai_finops_and_model_cost_manager',
      'mc11_business_graph',
      'mc30_agent_control_center',
      'mc30_autonomous_operations_center',
    ]) {
      expect(PlatformControlCenterScreen.supports(id), isTrue, reason: id);
    }
    expect(PlatformControlCenterScreen.supports('mc25_mining_operations'), isFalse);
  });
}
