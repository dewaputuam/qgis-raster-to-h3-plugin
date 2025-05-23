"""
Raster to H3 Converter Plugin

Deskripsi:
Plugin ini memungkinkan pengguna mengonversi data raster menjadi grid heksagonal H3 (Uber H3 index).
Output dapat berupa GeoJSON dengan geometri atau CSV dengan centroid koordinat.
Mendukung estimasi waktu proses, penamaan otomatis, log real-time, dan integrasi ke QGIS canvas.

Terakhir diperbarui: 2025-05-23
Dibuat oleh: Dewa bersama ChatGPT (GPT-4o)
"""
from qgis.PyQt.QtWidgets import (
    QAction, QFileDialog, QMessageBox, QInputDialog,
    QCheckBox, QDialog, QVBoxLayout, QHBoxLayout, QLabel,
    QComboBox, QLineEdit, QDialogButtonBox, QTextEdit, QProgressBar, QPushButton
)
from qgis.PyQt.QtGui import QIcon
from qgis.PyQt.QtWidgets import QApplication
from qgis.PyQt.QtWidgets import QDialogButtonBox
from qgis.PyQt.QtWidgets import QSlider
from qgis.PyQt.QtCore import Qt
from qgis.core import QgsVectorLayer, QgsProject, QgsRasterLayer
import os
import platform
import importlib.util
import rasterio
from rasterio.warp import transform as warp_transform
import h3
import numpy as np
import json
import geopandas as gpd
from shapely.geometry import shape
import csv
import datetime

class RasterToH3Plugin:
    def __init__(self, iface):
        self.iface = iface
        self.action = None
        self.about_action = None
        self.total_pixels = None
        self.optimal_level = None
        self.cancel_requested = False
        self.icon_path = os.path.join(os.path.dirname(__file__), "icon.png")

    def initGui(self):
        self.action = QAction(QIcon(self.icon_path), "Convert Raster to H3", self.iface.mainWindow())
        self.action.triggered.connect(self.run)
        self.iface.addPluginToMenu("Raster to H3", self.action)
        self.about_action = QAction(QIcon(self.icon_path), "About Raster to H3", self.iface.mainWindow())
        self.about_action.triggered.connect(self.show_about_dialog)
        self.iface.addPluginToMenu("Raster to H3", self.about_action)

    def unload(self):
        self.iface.removePluginMenu("Raster to H3", self.action)
        self.iface.removePluginMenu("Raster to H3", self.about_action)

    def run(self):
        # --- Automatic dependency check and install ---
        import subprocess, sys, importlib.util

        required_packages = {
            "h3": "h3",
            "geopandas": "geopandas",
            "rasterio": "rasterio",
            "shapely": "shapely",
            "pyproj": "pyproj",
            "pandas": "pandas",
            "requests": "requests"
        }

        missing = []
        for pkg, module in required_packages.items():
            if importlib.util.find_spec(module) is None:
                missing.append(pkg)

        if missing:
            try:
                import pip
            except ImportError:
                os_name = platform.system()
                QMessageBox.critical(
                    None,
                    "pip Not Found",
                    f"'pip' is not available in this QGIS environment.\n\n"
                    f"Detected OS: {os_name}\n"
                    f"Please install the following packages manually:\n\n"
                    f"{', '.join(missing)}"
                )
                return

            reply = QMessageBox.question(
                None,
                "Missing Python Libraries",
                f"The following required packages are missing:\n\n{', '.join(missing)}\n\nDo you want to install them now?",
                QMessageBox.Yes | QMessageBox.No
            )
            if reply == QMessageBox.Yes:
                try:
                    for pkg in missing:
                        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])
                    QMessageBox.information(None, "Installation", f"Successfully installed: {', '.join(missing)}.\nPlease restart QGIS.")
                except Exception as e:
                    QMessageBox.critical(None, "Installation Failed", f"Failed to install packages: {str(e)}")
                return
            else:
                QMessageBox.critical(None, "Missing Dependencies", "The plugin cannot continue without required packages.")
                return

        # === 1. Identifikasi Layer dan Input Awal ===
        layers = [layer for layer in QgsProject.instance().mapLayers().values() if isinstance(layer, QgsRasterLayer)]
        if not layers:
            QMessageBox.warning(None, "No Raster Layer", "No raster layer found on the canvas.")
            return
        dialog = QDialog()
        dialog.setWindowTitle("Raster to H3 Parameters")
        layout = QVBoxLayout()

        # Raster layer selector
        raster_layout = QHBoxLayout()
        raster_label = QLabel("Raster Layer:")
        raster_combo = QComboBox()
        raster_names = [layer.name() for layer in layers]
        raster_combo.addItems(raster_names)
        raster_layout.addWidget(raster_label)
        raster_layout.addWidget(raster_combo)
        layout.addLayout(raster_layout)

        # H3 resolution input (slider)
        res_layout = QHBoxLayout()
        res_label = QLabel("H3 Resolution:")
        res_slider = QSlider(Qt.Horizontal)
        res_slider.setMinimum(0)
        res_slider.setMaximum(15)
        res_slider.setValue(9)
        res_slider.setTickPosition(QSlider.NoTicks)
        res_slider.setStyleSheet("QSlider::groove:horizontal { height: 4px; } QSlider::handle:horizontal { background: #5c5; border: 1px solid #444; width: 12px; margin: -5px 0; border-radius: 6px; }")
        res_value = QLabel("9")
        def update_estimated_time(val):
            if self.total_pixels is None or self.optimal_level is None:
                return
            est_base = 10
            scaling_factor = 1.5 ** (val - self.optimal_level)
            est_time_sec = self.total_pixels / 1_000_000 * est_base * scaling_factor
            est_time_str = f"{est_time_sec:.1f} sec" if est_time_sec < 60 else f"{est_time_sec/60:.1f} min"

            # Estimasi area hexagon H3 berdasarkan level slider (copy from update_metadata)
            h3_edge_km = [
                1107, 418, 158, 59, 22, 8.3, 3.1, 1.15,
                0.43, 0.16, 0.06, 0.023, 0.0085, 0.0032, 0.0012, 0.00045
            ]
            edge_length_km = h3_edge_km[val] if val < len(h3_edge_km) else 0.00045
            hex_area = 2.598 * (edge_length_km ** 2)
            hex_area_m2 = hex_area * 1_000_000
            new_hex_area_line = f"• Est. hexagon area : ~{hex_area:.4f} km² / {hex_area_m2:,.0f} m² (level {val})"

            # Replace or append single line for estimated time and hex area
            lines = summary_text.toPlainText().splitlines()
            filtered_lines = [line for line in lines if not line.startswith("🕒 Estimated time") and not line.startswith("• Est. hexagon area")]
            filtered_lines.append(f"🕒 Estimated time for level {val}: {est_time_str}")
            filtered_lines.append(new_hex_area_line)
            summary_text.setPlainText("\n".join(filtered_lines))
        def on_slider_change(val):
            res_value.setText(str(val))
            update_estimated_time(val)
            # Update output path based on slider value
            ext = ".geojson" if geom_checkbox.isChecked() else ".csv"
            default_output_path = os.path.join(output_folder, f"h3_raster_output_{base_name}_{val}{ext}")
            output_input.setText(default_output_path)
        res_slider.valueChanged.connect(on_slider_change)
        res_layout.addWidget(res_label)
        res_layout.addWidget(res_slider)
        res_layout.addWidget(res_value)
        layout.addLayout(res_layout)

        # Geom checkbox
        geom_checkbox = QCheckBox("Include geometry in output")
        geom_checkbox.setChecked(True)
        layout.addWidget(geom_checkbox)

        summary_text = QTextEdit()
        summary_text.setReadOnly(True)
        layout.addWidget(summary_text)

        # === 2. Pengaturan Parameter dan Komponen Dialog ===
        output_layout = QHBoxLayout()
        output_label = QLabel("Output GeoJSON:")
        output_input = QLineEdit()
        output_button = QPushButton("Browse")
        output_layout.addWidget(output_label)
        output_layout.addWidget(output_input)
        output_layout.addWidget(output_button)
        layout.addLayout(output_layout)

        show_layer_checkbox = QCheckBox("Display output on canvas after processing")
        show_layer_checkbox.setChecked(True)
        layout.addWidget(show_layer_checkbox)

        # === 3. Fungsi Pembantu Dialog ===
        def update_metadata(index):
            selected_layer = layers[index]
            tif_path = selected_layer.source()
            try:
                with rasterio.open(tif_path) as src:
                    transform = src.transform
                    res_x = abs(transform.a)
                    res_y = abs(transform.e)
                    pixel_area = res_x * res_y
                    total_pixels = src.width * src.height
                    file_size = os.path.getsize(tif_path)
                    file_size_kb = file_size / 1024
                    file_size_str = f"{file_size_kb:.2f} KB" if file_size_kb < 1024 else f"{file_size_kb/1024:.2f} MB"

                    # H3 level estimation
                    h3_edge_meters = [
                        1107000, 418000, 158000, 59000, 22000, 8300, 3100, 1150,
                        430, 160, 60, 23, 8.5, 3.2, 1.2, 0.45
                    ]
                    avg_pixel = (res_x + res_y) / 2
                    optimal_level = next((i for i, edge in enumerate(h3_edge_meters) if avg_pixel >= edge), 15)
                    min_pixel = avg_pixel * 10
                    min_level = next((i for i, edge in enumerate(h3_edge_meters) if min_pixel >= edge), 15)
                    max_level = 15

                    # Estimated processing time (rough estimate: 1 million pixels = 10 seconds)
                    estimated_seconds = total_pixels / 1_000_000 * 10
                    estimated_time = f"{estimated_seconds:.1f} sec" if estimated_seconds < 60 else f"{estimated_seconds/60:.1f} min"

                    # Estimasi area hexagon H3 berdasarkan level slider
                    res_val = res_slider.value()
                    h3_edge_km = [
                        1107, 418, 158, 59, 22, 8.3, 3.1, 1.15,
                        0.43, 0.16, 0.06, 0.023, 0.0085, 0.0032, 0.0012, 0.00045
                    ]
                    edge_length_km = h3_edge_km[res_val] if res_val < len(h3_edge_km) else 0.00045
                    hex_area = 2.598 * (edge_length_km ** 2)
                    hex_area_m2 = hex_area * 1_000_000
                    new_hex_area_line = f"• Est. hexagon area : ~{hex_area:.4f} km² / {hex_area_m2:,.0f} m² (level {res_val})"

                    summary_text.setText(
                        f"=== Raster Metadata Summary ===\n"
                        f"📏 Pixel size       : {res_x:.2f} m x {res_y:.2f} m\n"
                        f"📐 Pixel area       : {pixel_area:.2f} m²\n"
                        f"📄 Raster dimension : {src.width} cols x {src.height} rows\n"
                        f"🔢 Total pixels     : {total_pixels}\n"
                        f"💾 File size        : {file_size_str}\n"
                        f"{'='*40}\n"
                        f"📝 Important Notes\n"
                        f"• File size         : {file_size_str}\n"
                        f"• Total pixels      : {total_pixels}\n"
                        f"• H3 recommendation : Min {min_level}, Max {max_level}, Optimal {optimal_level}\n"
                        f"• Est. duration     : {estimated_time}\n"
                        f"{new_hex_area_line}\n"
                        f"\n"
                        f"ℹ️ You are about to convert raster \"{selected_layer.name()}\" into Uber H3 vector polygons."
                    )
                    # Store total_pixels and optimal_level for later use
                    self.total_pixels = total_pixels
                    self.optimal_level = optimal_level
            except Exception as e:
                summary_text.setText(f"Failed to read raster metadata: {str(e)}")
            # After reading tif_path, set up output folder, base_name, etc.
            global input_folder, base_name, output_folder
            input_folder = os.path.dirname(tif_path)
            base_name = os.path.splitext(os.path.basename(tif_path))[0]
            output_folder = os.path.join(input_folder, "H3 Output")
            os.makedirs(output_folder, exist_ok=True)
            ext = ".geojson" if geom_checkbox.isChecked() else ".csv"
            default_output_path = os.path.join(output_folder, f"h3_raster_output_{base_name}_{res_slider.value()}{ext}")
            output_input.setText(default_output_path)
            # Update estimated time after updating metadata
            update_estimated_time(res_slider.value())

        raster_combo.currentIndexChanged.connect(update_metadata)
        update_metadata(0)
        update_estimated_time(9)

        def select_output_file():
            filetype = "GeoJSON files (*.geojson)" if geom_checkbox.isChecked() else "CSV files (*.csv)"
            path, _ = QFileDialog.getSaveFileName(None, "Save Output File", "", filetype)
            if path:
                output_input.setText(path)
        output_button.clicked.connect(select_output_file)

        def update_output_extension():
            val = res_slider.value()
            ext = ".geojson" if geom_checkbox.isChecked() else ".csv"
            new_output_path = os.path.join(output_folder, f"h3_raster_output_{base_name}_{val}{ext}")
            output_input.setText(new_output_path)
        geom_checkbox.stateChanged.connect(update_output_extension)

        # === 4. Tombol dan Logika Proses ===
        buttons = QDialogButtonBox()
        process_button = buttons.addButton("Process", QDialogButtonBox.AcceptRole)
        cancel_button = buttons.addButton("Cancel", QDialogButtonBox.RejectRole)
        process_button.clicked.connect(lambda: start_processing())
        cancel_button.clicked.connect(dialog.reject)
        # Add Cancel Process button
        self.cancel_button = buttons.addButton("Cancel Process", QDialogButtonBox.DestructiveRole)
        self.cancel_button.clicked.connect(lambda: setattr(self, 'cancel_requested', True))
        # Hide Cancel Process button by default
        self.cancel_button.setVisible(False)
        layout.addWidget(buttons)

        progress_bar = QProgressBar()
        layout.addWidget(progress_bar)

        # === 5. Fungsi Konversi dan Proses Utama ===
        def start_processing():
            self.cancel_requested = False
            # Hide the regular Cancel button, show Cancel Process button
            cancel_button.setVisible(False)
            self.cancel_button.setVisible(True)
            log_path = os.path.join(os.path.expanduser("~"), "h3_conversion.log")
            def log_message(msg):
                timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                full_msg = f"[{timestamp}] {msg}"
                summary_text.append(msg)
                QApplication.processEvents()
                with open(log_path, "a") as f:
                    f.write(full_msg + "\n")

            # Do not clear summary_text; just append log process below existing content
            summary_text.append("🔄 Starting processing... Please wait while we convert the raster to H3 grid.")
            summary_text.append("──────────────────────────────────────────────────────────────")
            log_message("🔄 Starting H3 raster conversion process...")

            selected_layer = layers[raster_combo.currentIndex()]
            tif_path = selected_layer.source()
            resolution = res_slider.value()
            output_path = output_input.text().strip()

            if not output_path:
                QMessageBox.warning(None, "Missing Output Path", "Please select a valid output file path.")
                # Show/hide buttons as before
                self.cancel_button.setVisible(False)
                cancel_button.setVisible(True)
                return

            include_geom = geom_checkbox.isChecked()
            show_layer = show_layer_checkbox.isChecked()

            try:
                progress_bar.setValue(0)
                log_message("📥 Reading raster file...")
                log_message("📊 Converting raster pixels into H3 hexagons...")
                gdf = self.raster_to_h3(tif_path, resolution, include_geom, summary_text, progress_bar)
                # Check for cancel
                if hasattr(self, "cancel_requested") and self.cancel_requested:
                    log_message("⚠️ Process cancelled by user.")
                    self.cancel_button.setVisible(False)
                    cancel_button.setVisible(True)
                    buttons.clear()
                    close_button = buttons.addButton("Close", QDialogButtonBox.RejectRole)
                    close_button.clicked.connect(dialog.reject)
                    return
                log_message("✅ Extraction complete. Saving file...")
                log_message("💾 Writing output file to disk...")
                if include_geom:
                    gdf.to_file(output_path, driver='GeoJSON')
                else:
                    with open(output_path, mode='w', newline='') as csvfile:
                        writer = csv.writer(csvfile)
                        writer.writerow(["h3_index", "value", "longitude", "latitude"])
                        for _, row in gdf.iterrows():
                            lat, lon = h3.h3_to_geo(row["h3_index"])
                            writer.writerow([row["h3_index"], row["value"], lon, lat])
                log_message("✅ Output file saved.")

                if show_layer:
                    vlayer = QgsVectorLayer(output_path, f"H3 Raster ({selected_layer.name()})", "ogr")
                    QgsProject.instance().addMapLayer(vlayer)
                    log_message("🗺️ H3 layer added to QGIS canvas.")

                log_message("\n=== Raster to H3 Extraction Summary ===")
                log_message(f"📦 Raster file     : {tif_path}")
                log_message(f"🧮 H3 resolution   : {resolution}")
                log_message(f"📊 Total H3 cells  : {len(gdf)}")
                # Show additional notification dialog with total hexagons
                QMessageBox.information(None, "Processing Complete", f"Raster conversion complete.\nTotal H3 hexagons: {len(gdf)}")
                self.cancel_button.setVisible(False)
                cancel_button.setVisible(True)
                buttons.clear()
                close_button = buttons.addButton("Close", QDialogButtonBox.RejectRole)
                close_button.clicked.connect(dialog.reject)
            except Exception as e:
                self.cancel_button.setVisible(False)
                cancel_button.setVisible(True)
                QMessageBox.critical(None, "Error", str(e))

        dialog.setLayout(layout)
        dialog.exec_()

    def raster_to_h3(self, tif_path, resolution, include_geom=True, summary_text=None, progress_bar=None):
        import os
        import datetime
        h3_data = {}
        with rasterio.open(tif_path) as src:
            raster = src.read(1)
            transform = src.transform
            nodata = src.nodata

            for row in range(raster.shape[0]):
                # Cancel check per row
                if hasattr(self, 'cancel_requested') and self.cancel_requested:
                    if summary_text:
                        summary_text.append("⚠️ Process cancelled by user.")
                    break
                for col in range(raster.shape[1]):
                    value = raster[row, col]
                    if value == nodata or np.isnan(value):
                        continue

                    x, y = rasterio.transform.xy(transform, row, col, offset='center')
                    lon, lat = warp_transform(src.crs, 'EPSG:4326', [x], [y])
                    lon = lon[0]
                    lat = lat[0]
                    h3_index = h3.geo_to_h3(lat, lon, resolution)

                    if h3_index not in h3_data:
                        h3_data[h3_index] = []
                    h3_data[h3_index].append(value)

                if row % 10 == 0 and progress_bar is not None and summary_text is not None:
                    progress = int(row / raster.shape[0] * 100)
                    progress_bar.setValue(progress)
                    msg = f"⏳ Processing row {row}/{raster.shape[0]}"
                    summary_text.append(msg)
                    QApplication.processEvents()
                    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    log_path = os.path.join(os.path.expanduser("~"), "h3_conversion.log")
                    with open(log_path, "a") as f:
                        f.write(f"[{timestamp}] {msg}\n")

        # If cancelled, return empty GeoDataFrame
        if hasattr(self, 'cancel_requested') and self.cancel_requested:
            cols = ["h3_index", "value", "geometry" if include_geom else "longitude", "latitude"]
            return gpd.GeoDataFrame(columns=cols, crs="EPSG:4326")

        rows = []
        for h3_index, values in h3_data.items():
            avg_val = float(np.mean(values))
            row = {
                "h3_index": h3_index,
                "value": avg_val
            }
            if include_geom:
                boundary = h3.h3_to_geo_boundary(h3_index, geo_json=True)
                row["geometry"] = shape({
                    "type": "Polygon",
                    "coordinates": [boundary]
                })
            rows.append(row)

        gdf = gpd.GeoDataFrame(rows, crs="EPSG:4326")
        if progress_bar is not None:
            progress_bar.setValue(100)
        return gdf
    def show_about_dialog(self):
        from qgis.PyQt.QtWidgets import QDialog, QVBoxLayout, QLabel, QDialogButtonBox
        from qgis.PyQt.QtCore import QDate
        about = QDialog()
        about.setWindowTitle("About Raster to H3 Converter")
        layout = QVBoxLayout()
        label = QLabel(
            "<h3>Raster to H3 Converter</h3>"
            "<p>This plugin converts raster data into Uber H3 hexagonal polygons.<br>"
            "Supports GeoJSON/CSV export, automatic pip dependency checking, estimated processing time,<br>"
            "real-time logging, and smart output naming.</p>"
            "<p><b>Version:</b> 1.2<br>"
            f"<b>Last Updated:</b> {QDate.currentDate().toString('dd MMMM yyyy')}<br>"
            "<b>Developer:</b> Dewa Putu Adikarma Mandala<br>"
            "<b>Libraries:</b> h3, geopandas, rasterio, shapely, pyproj, pandas, requests<br>"
            "<b>Credits:</b> Developed with assistance from ChatGPT-4o</p>"
            "<p>Website: <a href='https://dewaputuam.com'>dewaputuam.com</a></p>"
        )
        label.setWordWrap(True)
        layout.addWidget(label)
        btns = QDialogButtonBox(QDialogButtonBox.Ok)
        btns.accepted.connect(about.accept)
        layout.addWidget(btns)
        about.setLayout(layout)
        about.exec_()