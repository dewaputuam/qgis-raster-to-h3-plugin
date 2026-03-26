import importlib
import subprocess
import sys

def ensure_dependencies():
    required_packages = [
        "h3",
        "geopandas",
        "rasterio",
        "shapely",
        "pyproj",
        "pandas",
        "scipy",
        "requests"
    ]
    for package in required_packages:
        if importlib.util.find_spec(package) is None:
            print(f"[Plugin Setup] Installing missing package: {package}")
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])

# ensure_dependencies() dipanggil dari raster_to_h3_plugin.py saat run()
from qgis.core import QgsVectorLayer, QgsFeatureRequest
from qgis.PyQt.QtCore import QVariant
from qgis.utils import iface
from shapely.wkt import loads as load_wkt

import h3
import json
import numpy as np
import geopandas as gpd
from shapely.geometry import shape
from collections import defaultdict
from statistics import mode
from scipy.stats import skew

def build_hierarchy(df, parent_level, stat_method="mean", progress_log=None):
    """
    Aggregates H3 child-level data to parent-level.

    Parameters:
        df (GeoDataFrame): Must contain 'h3_index' and 'value'
        parent_level (int): Desired H3 level to aggregate to
        stat_method (str): Aggregation method ('mean', 'mode', 'min', 'max', 'skewness')

    Returns:
        GeoDataFrame: Aggregated values with parent H3 index and geometry
    """
    agg_map = defaultdict(list)

    for idx, (_, row) in enumerate(df.iterrows()):
        child_index = row.get("h3_index")
        value = row.get("value")
        if not h3.h3_is_valid(child_index):
            continue
        parent = h3.h3_to_parent(child_index, parent_level)
        agg_map[parent].append(value)
        if progress_log and idx % 1000 == 0:
            percent = int((idx + 1) / len(df) * 100)
            progress_log(percent)
            progress_log(f"🔸 Aggregating row {idx + 1}/{len(df)} to parent level {parent_level}")

    parent_result = {}
    for parent, values in agg_map.items():
        if not values:
            continue
        if stat_method == "mean":
            agg = float(np.mean(values))
        elif stat_method == "mode":
            try:
                agg = float(mode(values))
            except:
                agg = float(np.mean(values))
        elif stat_method == "min":
            agg = float(min(values))
        elif stat_method == "max":
            agg = float(max(values))
        elif stat_method == "skewness":
            agg = float(skew(values))
        else:
            agg = float(np.mean(values))
        parent_result[parent] = agg

    rows = []
    for parent, value in parent_result.items():
        boundary = h3.h3_to_geo_boundary(parent, geo_json=True)
        geometry = shape({
            "type": "Polygon",
            "coordinates": [boundary]
        })
        rows.append({
            "h3_index": parent,
            "value": value,
            "geometry": geometry
        })

    return gpd.GeoDataFrame(rows, crs="EPSG:4326")


# --- Utility function to load H3 raster-converted files (CSV or GeoJSON)
import os

def load_h3_file(filepath):
    """
    Loads H3 raster-converted file (CSV or GeoJSON) into a GeoDataFrame.

    Parameters:
        filepath (str): Path to the H3 output file.

    Returns:
        GeoDataFrame: Loaded data with required columns 'h3_index' and 'value'.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    ext = os.path.splitext(filepath)[1].lower()

    if ext == ".geojson":
        gdf = gpd.read_file(filepath)
        if "h3_index" not in gdf.columns or "value" not in gdf.columns:
            raise ValueError("GeoJSON must contain 'h3_index' and 'value' columns")
        return gdf

    elif ext == ".csv":
        import pandas as pd
        df = pd.read_csv(filepath)
        if "h3_index" not in df.columns or "value" not in df.columns:
            raise ValueError("CSV must contain 'h3_index' and 'value' columns")

        geometries = []
        for h3_index in df["h3_index"]:
            if h3.h3_is_valid(h3_index):
                boundary = h3.h3_to_geo_boundary(h3_index, geo_json=True)
                geometry = shape({"type": "Polygon", "coordinates": [boundary]})
                geometries.append(geometry)
            else:
                geometries.append(None)

        gdf = gpd.GeoDataFrame(df, geometry=geometries, crs="EPSG:4326")
        return gdf

    else:
        raise ValueError("Unsupported file format. Use .geojson or .csv")
def load_layer_from_qgis(layer):
    """
    Converts a QgsVectorLayer (already loaded in QGIS) into a GeoDataFrame compatible with H3 hierarchy processing.

    Parameters:
        layer (QgsVectorLayer): The selected layer from QGIS canvas.

    Returns:
        GeoDataFrame: Must include 'h3_index' and 'value' columns and geometry.
    """
    if not layer or not layer.isValid():
        raise ValueError("Invalid or missing vector layer.")

    h3_idx_idx = layer.fields().indexFromName("h3_index")
    value_idx = layer.fields().indexFromName("value")
    if h3_idx_idx == -1 or value_idx == -1:
        raise ValueError("Layer must contain 'h3_index' and 'value' fields.")

    features = layer.getFeatures()
    records = []
    for feat in features:
        h3_index = feat["h3_index"]
        value = feat["value"]
        geometry = feat.geometry()
        if geometry:
            records.append({
                "h3_index": h3_index,
                "value": value,
                "geometry": load_wkt(geometry.asWkt())
            })

    return gpd.GeoDataFrame(records, crs="EPSG:4326")

def generate_hierarchy_levels(df, parent_levels=0, stat_method="mean", progress_log=None):
    """
    Generate multiple parent H3 levels from a given base H3 dataframe.

    Parameters:
        df (GeoDataFrame): Must contain 'h3_index' and 'value'
        parent_levels (int): Number of levels above the base to generate
        stat_method (str): Aggregation method for parent levels

    Returns:
        dict: Mapping from H3 level to GeoDataFrame
    """
    from copy import deepcopy

    def level_of(h3_index):
        return h3.h3_get_resolution(h3_index)

    if df.empty:
        raise ValueError("Input dataframe is empty.")

    base_level = level_of(df.iloc[0]["h3_index"])
    results = {base_level: df.copy()}

    # Generate parent levels
    for i in range(1, parent_levels + 1):
        target_level = base_level - i
        if target_level < 0:
            break
        from .h3_hierarchy_builder import build_hierarchy
        if progress_log:
            progress_log(0)
        parent_df = build_hierarchy(df, parent_level=target_level, stat_method=stat_method, progress_log=progress_log)
        results[target_level] = parent_df
        if progress_log:
            progress_log(int(i / parent_levels * 100))

    return results


# --- Export to GPKG with QML RuleRenderer style ---
def export_to_gpkg_with_qml(
    hierarchy_dict,
    output_gpkg_path,
    column="resolution",
    n_classes=5,
    colormap_name="pastel_rgy"
):
    """
    Export multiple H3 levels into a single GeoPackage with a matching QML style file.

    Parameters:
        hierarchy_dict (dict): mapping from level -> GeoDataFrame
        output_gpkg_path (str): full path to .gpkg file
        column (str): name of the field storing resolution info (default: 'resolution')
        n_classes (int): number of classes for classification
        colormap_name (str): name of the color map to use
    """
    import os
    import pandas as pd
    import geopandas as gpd
    from xml.etree.ElementTree import Element, SubElement, ElementTree
    import numpy as np

    # Scale ranges must be contiguous (no gaps) so layers are always visible.
    # scalemindenom = zoom in limit (smaller number = more zoomed in)
    # scalemaxdenom = zoom out limit (larger number = more zoomed out)
    # Each level's scalemindenom equals the next level's scalemaxdenom.
    zoom_scale = {
        0: (500000000, 0),          # most zoomed out (no upper limit = 0)
        1: (200000000, 500000000),
        2: (50000000, 200000000),
        3: (10000000, 50000000),
        4: (5000000, 10000000),
        5: (1000000, 5000000),
        6: (500000, 1000000),
        7: (200000, 500000),
        8: (100000, 200000),
        9: (50000, 100000),
        10: (25000, 50000),
        11: (10000, 25000),
        12: (5000, 10000),
        13: (2500, 5000),
        14: (1000, 2500),
        15: (0, 1000),              # most zoomed in (no lower limit = 0)
    }

    # Ensure output dir exists
    os.makedirs(os.path.dirname(output_gpkg_path), exist_ok=True)
    style_path = output_gpkg_path.replace(".gpkg", ".qml")

    # Export each level to gpkg with shared layer name
    all_features = []
    for level, gdf in hierarchy_dict.items():
        gdf = gdf.copy()
        gdf[column] = level
        all_features.append(gdf)
    merged = gpd.GeoDataFrame(pd.concat(all_features, ignore_index=True), crs="EPSG:4326")
    merged.to_file(output_gpkg_path, driver="GPKG", layer="h3_multi")

    # --- Dynamically compute class ranges and colors ---
    # Gather all 'value' from all GeoDataFrames
    all_values = []
    for gdf in hierarchy_dict.values():
        all_values.append(gdf["value"].values)
    all_values = np.concatenate(all_values)
    vmin = np.nanmin(all_values)
    vmax = np.nanmax(all_values)
    # --- Classification logic: always equal interval ---
    breaks = np.linspace(vmin, vmax, n_classes + 1)
    breaks = np.array(breaks)
    # Colormap logic
    if colormap_name == "pastel_rgy":
        color_list = [
            "153,255,153,255",  # green
            "204,255,153,255",
            "255,255,153,255",  # yellow
            "255,204,153,255",
            "255,153,153,255"   # red
        ]
        def get_custom_color(i, n):
            return color_list[i % len(color_list)]
    else:
        from matplotlib import cm
        cmap = cm.get_cmap(colormap_name)
        def get_custom_color(i, n):
            rgba = cmap(i / max(1, n))
            rgb = tuple(int(255 * c) for c in rgba[:3])
            return f"{rgb[0]},{rgb[1]},{rgb[2]},255"
    # For equal interval, n_classes = len(breaks)-1
    class_ranges = []
    actual_n_classes = len(breaks) - 1
    for i in range(actual_n_classes):
        color_str = get_custom_color(i, actual_n_classes)
        class_ranges.append((breaks[i], breaks[i+1], color_str))

    # Generate QML
    qgis = Element("qgis", version="3.28", styleCategories="Symbology")
    renderer = SubElement(qgis, "renderer-v2", type="RuleRenderer", symbollevels="0",
                          forceraster="0", enableorderby="0")
    symbols = SubElement(renderer, "symbols")
    rules = SubElement(renderer, "rules")

    levels_sorted = sorted(hierarchy_dict.keys())

    symbol_id = 0
    for level in levels_sorted:
        minscale, maxscale = zoom_scale.get(level, (0, 0))
        for j, (vmin_c, vmax_c, color) in enumerate(class_ranges):
            symbol = SubElement(symbols, "symbol", name=str(symbol_id), type="fill", alpha="1", force_rhr="0")
            layer = SubElement(symbol, "layer", **{"pass": "0", "class": "SimpleFill", "locked": "0"})
            for k, v in {
                "color": color,
                "outline_color": "35,35,35,255",
                "outline_style": "solid",
                "outline_width": "0.26"
            }.items():
                SubElement(layer, "prop", k=k, v=v)
            # First class uses >= to include minimum value
            if j == 0:
                value_filter = f'"value" >= {vmin_c} AND "value" <= {vmax_c}'
            else:
                value_filter = f'"value" > {vmin_c} AND "value" <= {vmax_c}'
            label = f"Level {level} - Class {j+1}"
            rule_attrs = {
                "symbol": str(symbol_id),
                "filter": f'"{column}" = {level} AND {value_filter}',
                "label": label,
                "renderingPass": str(symbol_id),
            }
            # Only add scale limits if they are non-zero (0 means no limit)
            if minscale > 0:
                rule_attrs["scalemindenom"] = str(minscale)
            if maxscale > 0:
                rule_attrs["scalemaxdenom"] = str(maxscale)
            rule = SubElement(rules, "rule", **rule_attrs)
            symbol_id += 1

    ElementTree(qgis).write(style_path, encoding="utf-8", xml_declaration=True)

from qgis.PyQt.QtWidgets import QDialog, QVBoxLayout, QLabel, QPushButton, QSpinBox, QComboBox, QTextEdit, QFileDialog, QCheckBox, QHBoxLayout, QFrame, QApplication
from qgis.PyQt.QtCore import Qt

# --- Hierarchy Dialog for QGIS Plugin UI ---
class HierarchyDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("H3 Hierarchy Builder")
        self.setMinimumWidth(400)

        layout = QVBoxLayout()
        self.setLayout(layout)

        # --- Title Header ---
        title = QLabel("🧱 H3 Hierarchy Extraction")
        title.setStyleSheet("font-weight: bold; font-size: 14pt; margin-bottom: 6px;")
        layout.addWidget(title)

        line = QFrame()
        line.setFrameShape(QFrame.HLine)
        line.setFrameShadow(QFrame.Sunken)
        layout.addWidget(line)

        # --- Group: Levels ---
        level_box = QVBoxLayout()
        level_box.addWidget(QLabel("➕ Hierarchy Levels"))

        self.parent_label = QLabel("Number of parent levels to generate:")
        self.parent_spin = QSpinBox()
        self.parent_spin.setMinimum(0)
        self.parent_spin.setMaximum(15)
        self.parent_spin.setValue(2)

        level_box.addWidget(self.parent_label)
        level_box.addWidget(self.parent_spin)

        layout.addLayout(level_box)

        # --- Aggregation Method ---
        method_label = QLabel("📊 Aggregation Method for Parent:")
        method_label.setStyleSheet("margin-top: 12px; font-weight: bold;")
        layout.addWidget(method_label)

        self.method_combo = QComboBox()
        self.method_combo.addItems(["mean", "mode", "min", "max", "skewness"])
        layout.addWidget(self.method_combo)

        # --- Output settings ---
        self.output_box = QHBoxLayout()
        self.output_checkbox = QCheckBox("Custom Output Path")
        self.output_checkbox.stateChanged.connect(self.toggle_output_selection)
        self.output_button = QPushButton("Select Output File (.gpkg)")
        self.output_button.setEnabled(False)
        self.output_button.clicked.connect(self.choose_output_path)
        self.output_box.addWidget(self.output_checkbox)
        self.output_box.addWidget(self.output_button)

        output_label = QLabel("💾 Output Settings")
        output_label.setStyleSheet("margin-top: 12px; font-weight: bold;")
        layout.addWidget(output_label)
        layout.addLayout(self.output_box)

        self.output_path = None
        # --- Style Classification group ---
        style_group_label = QLabel("🎨 Style Classification")
        style_group_label.setStyleSheet("margin-top: 12px; font-weight: bold;")
        layout.addWidget(style_group_label)

        # Jumlah Kelas (untuk Pewarnaan)
        self.class_count_label = QLabel("Jumlah Kelas (untuk Pewarnaan)")
        layout.addWidget(self.class_count_label)
        self.class_spin = QSpinBox()
        self.class_spin.setMinimum(2)
        self.class_spin.setMaximum(9)
        self.class_spin.setValue(5)
        layout.addWidget(self.class_spin)

        # Metode Klasifikasi
        self.class_method_label = QLabel("Metode Klasifikasi")
        self.class_method_label.setVisible(False)
        layout.addWidget(self.class_method_label)
        self.class_method_combo = QComboBox()
        self.class_method_combo.addItems(["equal_interval", "natural_breaks", "manual"])
        self.class_method_combo.setCurrentText("equal_interval")
        self.class_method_combo.setVisible(False)
        layout.addWidget(self.class_method_combo)
        self.class_method_label.hide()
        self.class_method_combo.hide()

        # Colormap selection (Palet Warna)
        self.colormap_label = QLabel("Palet Warna (Colormap)")
        layout.addWidget(self.colormap_label)
        self.colormap_combo = QComboBox()
        self.colormap_combo.addItems(["pastel_rgy", "plasma", "viridis", "magma", "cividis", "RdYlGn"])
        self.colormap_combo.setCurrentText("pastel_rgy")
        layout.addWidget(self.colormap_combo)

        # Manual class inputs (hidden by default)
        # self.manual_class_inputs = QTextEdit()
        # self.manual_class_inputs.setPlaceholderText("Masukkan batas kelas manual (misal: 0,10,20,30,40,50)")
        # self.manual_class_inputs.setVisible(False)
        # layout.addWidget(self.manual_class_inputs)

        self.log_area = QTextEdit()
        self.log_area.setReadOnly(True)

        # --- Button row (Cancel + Run) ---
        self.button_box = QHBoxLayout()
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.setEnabled(False)
        self.cancel_button.clicked.connect(self.cancel_process)

        self.run_button = QPushButton("Run Hierarchy Extraction")
        self.run_button.clicked.connect(self.run_extraction)

        self.button_box.addWidget(self.cancel_button)
        self.button_box.addWidget(self.run_button)

        process_label = QLabel("⚙️ Extraction Controls")
        process_label.setStyleSheet("margin-top: 12px; font-weight: bold;")
        layout.addWidget(process_label)
        layout.addLayout(self.button_box)

        # --- Log and Progress Bar ---
        layout.addWidget(QLabel("📝 Process Log:"))
        layout.addWidget(self.log_area)
        # Progress bar will be inserted dynamically in run_extraction

        # --- Load metadata summary on dialog init ---
        self.load_metadata_summary()

    def load_metadata_summary(self):
        import os
        from .h3_hierarchy_builder import load_layer_from_qgis
        try:
            layer = iface.activeLayer()
            if not layer or not layer.isValid():
                return
            self.log_area.append("🧾 Input Data Summary")
            self.log_area.append(f"📄 File: {layer.name()}")
            self.log_area.append(f"📁 Path: {layer.source()}")

            # File size estimate
            file_path = layer.source().split("|")[0]  # strip sublayer syntax
            if os.path.exists(file_path):
                size_mb = os.path.getsize(file_path) / (1024 * 1024)
                self.log_area.append(f"💾 File size: {size_mb:.2f} MB")

            gdf = load_layer_from_qgis(layer)
            import h3
            base_level = h3.h3_get_resolution(gdf.iloc[0]["h3_index"])
            bounds = gdf.total_bounds
            value_col = gdf["value"]
            self.log_area.append(f"🧮 Resolution: {base_level}")
            self.log_area.append(f"📦 H3 Cells: {len(gdf)}")
            self.log_area.append(f"📐 Extent: xmin={bounds[0]:.4f}, ymin={bounds[1]:.4f}, xmax={bounds[2]:.4f}, ymax={bounds[3]:.4f}")
            self.log_area.append(f"📊 Value range: min={value_col.min():.2f}, max={value_col.max():.2f}, mean={value_col.mean():.2f}")
        except Exception as e:
            self.log_area.append(f"⚠️ Failed to load metadata: {str(e)}")

    def toggle_output_selection(self, state):
        self.output_button.setEnabled(state == Qt.Checked)
        if state != Qt.Checked:
            self.output_path = None  # Reset if unchecked

    def choose_output_path(self):
        path, _ = QFileDialog.getSaveFileName(self, "Save Hierarchy Output", "", "GeoPackage (*.gpkg)")
        if path:
            if not path.endswith(".gpkg"):
                path += ".gpkg"
            self.output_path = path
            self.log_area.append(f"Output path set to: {path}")

    # def toggle_manual_class_inputs(self, text):
    #     if text == "manual":
    #         self.manual_class_inputs.setVisible(True)
    #     else:
    #         self.manual_class_inputs.setVisible(False)

    def run_extraction(self):
        from qgis.PyQt.QtWidgets import QMessageBox
        import os
        import datetime
        try:
            layer = iface.activeLayer()
            if not layer:
                QMessageBox.warning(self, "Error", "No active layer found.")
                return

            # --- Metadata header ---
            self.log_area.append("🧾 Input Data Summary")
            self.log_area.append(f"📄 File: {layer.name()}")
            self.log_area.append(f"📁 Path: {layer.source()}")

            # File size estimate
            try:
                file_path = layer.source().split("|")[0]  # strip sublayer syntax
                if os.path.exists(file_path):
                    size_mb = os.path.getsize(file_path) / (1024 * 1024)
                    self.log_area.append(f"💾 File size: {size_mb:.2f} MB")
            except Exception:
                pass

            # Feature stats
            from .h3_hierarchy_builder import load_layer_from_qgis
            gdf = load_layer_from_qgis(layer)
            import h3
            base_level = h3.h3_get_resolution(gdf.iloc[0]["h3_index"])
            bounds = gdf.total_bounds
            value_col = gdf["value"]
            self.log_area.append(f"🧮 Resolution: {base_level}")
            self.log_area.append(f"📦 H3 Cells: {len(gdf)}")
            self.log_area.append(f"📐 Extent: xmin={bounds[0]:.4f}, ymin={bounds[1]:.4f}, xmax={bounds[2]:.4f}, ymax={bounds[3]:.4f}")
            self.log_area.append(f"📊 Value range: min={value_col.min():.2f}, max={value_col.max():.2f}, mean={value_col.mean():.2f}")

            # Planned hierarchy
            parent = self.parent_spin.value()
            self.log_area.append("\n📌 Planned Hierarchy Output")
            levels = [base_level - i for i in range(1, parent + 1) if base_level - i >= 0] + [base_level]
            for lvl in levels:
                est = len(gdf) * (7 ** abs(lvl - base_level)) if lvl > base_level else int(len(gdf) / (7 ** (base_level - lvl))) if lvl < base_level else len(gdf)
                self.log_area.append(f"🔸 Level {lvl}: approx. {est:,} H3 cells")

            folder = os.path.dirname(layer.source())
            input_name = os.path.splitext(os.path.basename(layer.source().split("|")[0]))[0]
            timestamp = datetime.datetime.now().strftime("%Y%m%d")
            default_name = f"{input_name}_hierarchy_L{base_level}_par{parent}_{timestamp}.gpkg"
            default_path = os.path.join(folder, default_name)

            if not self.output_checkbox.isChecked():
                self.output_path = default_path
                self.log_area.append(f"📁 Using default path: {self.output_path}")
            elif not self.output_path:
                self.log_area.append("⚠ Output path not set. Please choose a location.")
                return

            method = self.method_combo.currentText()

            # --- Style classification params ---
            n_classes = self.class_spin.value()

            self.run_button.setDisabled(True)
            self.log_area.append("⏳ Processing in background...")
            QApplication.processEvents()

            # --- Progress bar integration ---
            if not hasattr(self, "progress_bar"):
                from qgis.PyQt.QtWidgets import QProgressBar
                self.progress_bar = QProgressBar(self)
                # Insert progress bar before the last widget (log_area is last, so after log_area)
                self.layout().addWidget(self.progress_bar)
            self.progress_bar.setMinimum(0)
            self.progress_bar.setMaximum(100)
            self.progress_bar.setValue(0)

            self.worker = HierarchyWorker(layer, parent, method, self.output_path, n_classes)
            self.worker.signals.log.connect(self.log_area.append)
            self.worker.signals.error.connect(lambda msg: QMessageBox.critical(self, "Error", msg))
            self.worker.signals.finished.connect(self.on_finished)
            self.worker.signals.progress.connect(self.progress_bar.setValue)
            self.progress_bar.setValue(0)

            QThreadPool.globalInstance().start(self.worker)

        except Exception as e:
            self.log_area.append(f"❌ Error: {str(e)}")

    def on_finished(self, path, total):
        from qgis.PyQt.QtWidgets import QMessageBox
        self.run_button.setDisabled(False)
        self.log_area.append(f"✅ Hierarchy exported successfully.")
        self.log_area.append(f"📦 Total features written: {total}")
        if hasattr(self, "progress_bar"):
            self.progress_bar.setValue(100)
        # Add the layer to QGIS after writing, with a small retry if needed
        from qgis.core import QgsVectorLayer
        from qgis.utils import iface
        import time
        layer = QgsVectorLayer(path + "|layername=h3_multi", "H3 Hierarchy Output", "ogr")
        if not layer.isValid():
            time.sleep(0.5)
            layer = QgsVectorLayer(path + "|layername=h3_multi", "H3 Hierarchy Output", "ogr")
        if layer.isValid():
            iface.addVectorLayer(layer.source(), layer.name(), "ogr")
        # --- Update cancel_button to "Close" and connect to accept ---
        self.cancel_button.setText("Close")
        self.cancel_button.setEnabled(True)
        self.cancel_button.clicked.disconnect()
        self.cancel_button.clicked.connect(self.accept)
        QMessageBox.information(self, "Hierarchy Complete", f"H3 hierarchy extraction completed.\nOutput saved to:\n{path}")

    def cancel_process(self):
        self.log_area.append("⚠ Cancelling process...")
        if hasattr(self, "worker"):
            self.worker._is_cancelled = True
# --- Background Worker for Hierarchy Extraction ---
from qgis.PyQt.QtCore import QRunnable, QThreadPool, pyqtSignal, QObject

class HierarchySignals(QObject):
    finished = pyqtSignal(str, int)
    error = pyqtSignal(str)
    log = pyqtSignal(str)
    progress = pyqtSignal(int)

class HierarchyWorker(QRunnable):
    def __init__(self, layer, parent, method, output_path, n_classes):
        super().__init__()
        self.layer = layer
        self.parent = parent
        self.method = method
        self.output_path = output_path
        self.n_classes = n_classes
        self.signals = HierarchySignals()

    def run(self):
        from .h3_hierarchy_builder import load_layer_from_qgis, generate_hierarchy_levels, export_to_gpkg_with_qml
        try:
            gdf = load_layer_from_qgis(self.layer)
            import h3
            self.signals.log.emit(f"✔ Loaded layer with {len(gdf)} features at H3 level {h3.h3_get_resolution(gdf.iloc[0]['h3_index'])}")
            self.signals.log.emit(f"🔁 Generating hierarchy: {self.parent} parent(s) using '{self.method}'")
            def composite_logger(msg_or_percent):
                if isinstance(msg_or_percent, int):
                    self.signals.progress.emit(msg_or_percent)
                else:
                    self.signals.log.emit(str(msg_or_percent))
            hierarchy = generate_hierarchy_levels(
                gdf,
                parent_levels=self.parent,
                stat_method=self.method,
                progress_log=composite_logger
            )
            # Log before saving
            self.signals.log.emit("💾 Saving hierarchy to GeoPackage and generating QML...")
            export_to_gpkg_with_qml(
                hierarchy,
                self.output_path,
                n_classes=self.n_classes
            )
            # Log after saving
            self.signals.log.emit("✅ File saved. Preparing final output...")
            total = sum(len(gdf) for gdf in hierarchy.values())
            self.signals.finished.emit(self.output_path, total)
        except Exception as e:
            self.signals.error.emit(str(e))
    # Duplicate and invalid methods removed