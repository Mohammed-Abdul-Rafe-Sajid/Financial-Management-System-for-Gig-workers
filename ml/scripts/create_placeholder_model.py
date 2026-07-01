"""
create_placeholder_model.py
Creates a minimal placeholder LightGBM model so prediction-service
can start before the full synthetic dataset is generated.

Run: python ml/scripts/create_placeholder_model.py
"""

import os
import numpy as np
import joblib
from pathlib import Path

try:
    import lightgbm as lgb
    USE_LGBM = True
except ImportError:
    from sklearn.ensemble import GradientBoostingRegressor
    USE_LGBM = False

OUTPUT_PATH = Path(__file__).parent.parent / "models" / "generic_model.joblib"
OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

# Feature names must match prediction-service exactly (see SESSION_PROMPTS.md §4)
FEATURE_NAMES = [
    "gross_earnings_inr_rolling_7d",
    "gross_earnings_inr_rolling_30d",
    "sessions_count_rolling_7d",
    "sessions_count_rolling_30d",
    "day_of_week",
    "is_weekday",
    "is_public_holiday",
    "is_festival_period",
    "weather_condition_encoded",
    "temperature_celsius",
    "traffic_index",
    "fuel_price_per_litre",
    "platform_encoded",
    "domain_encoded",
    "surge_premium_flag",
    "worker_session_count",
    "personal_weight",
]

np.random.seed(42)
N = 5000

# Synthetic feature matrix with realistic value ranges
X = np.column_stack([
    np.random.uniform(200, 1500, N),    # rolling_7d avg earnings
    np.random.uniform(200, 1200, N),    # rolling_30d avg earnings
    np.random.randint(1, 15, N),        # sessions rolling 7d
    np.random.randint(5, 50, N),        # sessions rolling 30d
    np.random.randint(0, 7, N),         # day_of_week
    np.random.randint(0, 2, N),         # is_weekday
    np.random.randint(0, 2, N),         # is_public_holiday
    np.random.randint(0, 2, N),         # is_festival_period
    np.random.randint(0, 6, N),         # weather_condition_encoded
    np.random.uniform(18, 42, N),       # temperature_celsius
    np.random.uniform(0, 1, N),         # traffic_index
    np.random.uniform(92, 112, N),      # fuel_price_per_litre
    np.random.randint(0, 11, N),        # platform_encoded
    np.random.randint(0, 6, N),         # domain_encoded
    np.random.randint(0, 2, N),         # surge_premium_flag
    np.random.randint(0, 500, N),       # worker_session_count
    np.random.uniform(0.1, 0.9, N),    # personal_weight
])

# Target: realistic daily earnings in INR
y = (
    X[:, 0] * 0.15 +          # driven by rolling average
    X[:, 5] * 80 +             # weekday bonus
    X[:, 7] * 150 +            # festival bonus
    np.random.normal(0, 50, N) # noise
).clip(100, 2000)

if USE_LGBM:
    model = lgb.LGBMRegressor(
        n_estimators=100,
        learning_rate=0.1,
        num_leaves=31,
        random_state=42,
        verbose=-1,
    )
    model.fit(X, y)
    print("✅ Trained LightGBM placeholder model")
else:
    model = GradientBoostingRegressor(n_estimators=100, random_state=42)
    model.fit(X, y)
    print("✅ Trained sklearn GBR placeholder model (install lightgbm for production)")

# Save with metadata
artifact = {
    "model": model,
    "feature_names": FEATURE_NAMES,
    "model_type": "lightgbm_placeholder",
    "version": "0.1.0-placeholder",
    "note": "PLACEHOLDER — retrain with generate_dataset.py + train_generic_model.py",
}

joblib.dump(artifact, OUTPUT_PATH)
print(f"✅ Saved to {OUTPUT_PATH}")
print("   Next: run `python ml/data_generation/generate_dataset.py` for the real model.")
