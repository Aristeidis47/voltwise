/** A local fictional document, never an OCR/upload result or a contract identifier. */
export const DEMO_BILL_SAMPLE = Object.freeze({
  sample_id: 'VOLTWISE-SAMPLE-01', is_demo: true, is_real_bill: false,
  title: 'Φανταστικό δείγμα λογαριασμού',
  consumption: Object.freeze({ quantity_mode: 'SPLIT', normal_kwh: '360', reduced_kwh: '240', period_days: 60 } as const),
});
