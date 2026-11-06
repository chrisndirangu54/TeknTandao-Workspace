"""Deterministic offline ML smoke tests; data is synthetic and not a performance claim."""
import json
import tempfile
import unittest
from pathlib import Path
import numpy as np
from train_models import load_samples,train_site_model

class HotspotMLTests(unittest.TestCase):
    def test_site_isolation_and_model_card(self):
        rng=np.random.default_rng(42)
        start=1760000000000
        records=[]
        for i in range(300):
            m={"clientCount":int(max(0,20+5*np.sin(i/12)+rng.integers(-2,3))),
               "latencyMs":float(max(1,15+rng.normal(0,3))),
               "packetLossPercent":float(max(0,rng.normal(1,0.2))),
               "batteryPercent":float(max(1,85+rng.normal(0,3))),
               "signalDbm":float(-60+rng.normal(0,2)),
               "wanUp":bool(i%43!=0)}
            records.append({"siteId":"site_10001","observedAtMs":start+i*3600000,"metrics":m})
            if i%20==0:
                records.append({"siteId":"other_10002","observedAtMs":start+i*3600000,"metrics":m})
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"telemetry.jsonl"
            path.write_text("\n".join(json.dumps(x) for x in records),encoding="utf-8")
            frame=load_samples(path,"site_10001")
            self.assertLessEqual(len(frame),300)
            self.assertIn("target_next_clients",frame.columns)
            self.assertTrue((frame["target_next_clients"].iloc[:-1].to_numpy()==
                             frame["clients"].iloc[1:].to_numpy()).all())
            report=train_site_model(frame,"site_10001",Path(directory)/"model")
            self.assertEqual(report["siteId"],"site_10001")
            self.assertFalse(report["deployed"])
            self.assertTrue((Path(directory)/"model"/"model_card.json").exists())
            self.assertTrue((Path(directory)/"model"/"hotspot_models.joblib").exists())
    def test_insufficient_samples_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"empty.jsonl"
            path.write_text('{"siteId":"site_10001","observedAtMs":1000,"metrics":{"clientCount":1}}\n')
            with self.assertRaises(ValueError):
                load_samples(path,"site_10001")

if __name__=="__main__":unittest.main()
