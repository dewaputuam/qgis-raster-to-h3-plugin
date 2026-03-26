"""
Raster to H3 Converter Plugin v1.3

Deskripsi:
Plugin QGIS untuk mengonversi data raster menjadi grid heksagonal Uber H3.
Mendukung output GeoJSON/CSV, optimized chunked-vectorized engine,
multi-level hierarchy builder dengan auto-styling, dan export ke PostgreSQL.

Terakhir diperbarui: 2025-02-12
Dibuat oleh: Dewa Putu Adikarma Mandala
AI-assisted by: ChatGPT (GPT-4o) & Claude (Anthropic)
"""
from qgis.PyQt.QtWidgets import (
    QAction, QFileDialog, QMessageBox,
    QCheckBox, QDialog, QVBoxLayout, QHBoxLayout, QLabel,
    QComboBox, QLineEdit, QDialogButtonBox, QTextEdit, QProgressBar, QPushButton,
    QGroupBox, QFormLayout, QTextBrowser, QWidget, QFrame,
    QApplication, QSlider
)
from qgis.PyQt.QtGui import QIcon
from qgis.PyQt.QtCore import Qt
from qgis.core import QgsVectorLayer, QgsProject, QgsRasterLayer
from .h3_hierarchy_builder import load_h3_file, build_hierarchy
import os
import platform
import rasterio
from rasterio.warp import transform as warp_transform
import h3
import numpy as np
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
        self.valid_pixels = None
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

    def show_about_dialog(self):
        from qgis.PyQt.QtWidgets import QDialog, QVBoxLayout, QLabel, QDialogButtonBox
        about = QDialog()
        about.setWindowTitle("About Raster to H3 Converter")
        layout = QVBoxLayout()
        label = QLabel(
            "<h3>Raster to H3 Converter</h3>"
            "<p>Mengonversi data raster menjadi grid heksagonal Uber H3.<br>"
            "Mendukung output GeoJSON/CSV, optimized chunked-vectorized engine,<br>"
            "multi-level hierarchy builder, dan export ke PostgreSQL.</p>"
            "<p><b>Version:</b> 1.3<br>"
            "<b>Developer:</b> Dewa Putu Adikarma Mandala<br>"
            "<b>AI-assisted by:</b> ChatGPT (GPT-4o) &amp; Claude (Anthropic)</p>"
        )
        label.setWordWrap(True)
        layout.addWidget(label)
        btns = QDialogButtonBox(QDialogButtonBox.Ok)
        btns.accepted.connect(about.accept)
        layout.addWidget(btns)
        about.setLayout(layout)
        about.exec_()

    def run(self):
        # Reset important state variables at the start of each run
        self.total_pixels = None
        self.valid_pixels = None
        self.optimal_level = None
        self.cancel_requested = False
        self.cancel_button = None
        self._input_folder = None
        self._base_name = None
        self._output_folder = None
        # --- Automatic dependency check and install ---
        import subprocess, sys, importlib.util

        required_packages = {
            "h3": "h3",
            "geopandas": "geopandas",
            "rasterio": "rasterio",
            "shapely": "shapely",
            "pyproj": "pyproj",
            "pandas": "pandas",
            "requests": "requests",
            "psycopg2": "psycopg2"
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
        dialog.setMinimumWidth(950)
        dialog.setMinimumHeight(600)

        # === Main horizontal layout: left (form) + right (help panel) ===
        main_layout = QHBoxLayout()

        # --- Left panel: form controls ---
        left_widget = QWidget()
        layout = QVBoxLayout()
        left_widget.setLayout(layout)

        # --- Right panel: help/description ---
        help_panel = QTextBrowser()
        help_panel.setOpenExternalLinks(True)
        help_panel.setMinimumWidth(280)
        help_panel.setMaximumWidth(320)
        help_panel.setStyleSheet("""
            QTextBrowser {
                background-color: #ffffff;
                border: 1px solid #cccccc;
                border-radius: 4px;
                padding: 8px;
                font-size: 12px;
            }
        """)
        help_panel.setHtml("""
            <h3 style="margin-top:0;">Raster to H3 Converter</h3>
            <p style="color:#555;">
                Mengonversi data raster (<code>.tif</code>) menjadi grid heksagonal
                <b>Uber H3</b>. Setiap pixel raster dipetakan ke H3 cell index,
                lalu diagregasi (rata-rata) per cell.
            </p>
            <hr>
            <h4>Cara Kerja</h4>
            <ol style="padding-left:18px; color:#444;">
                <li>Pilih <b>raster layer</b> dari canvas QGIS</li>
                <li>Atur <b>H3 Resolution</b> (0-15) &mdash; semakin tinggi, semakin detail</li>
                <li>Klik <b>Process</b> untuk memulai konversi</li>
                <li>Output berupa <b>GeoJSON</b> (dengan geometri) atau <b>CSV</b> (centroid)</li>
            </ol>
            <hr>
            <h4>H3 Resolution Reference</h4>
            <p style="color:#555; font-size:11px;">
                Semakin tinggi level, semakin kecil &amp; detail hexagon:
            </p>
            <table style="font-size:10px; border-collapse:collapse; width:100%;">
                <tr style="background:#e8e8e8;">
                    <th style="padding:3px; text-align:center;">Res</th>
                    <th style="padding:3px;">Edge Length</th>
                    <th style="padding:3px;">Hex Area</th>
                </tr>
                <tr><td style="padding:2px 4px; text-align:center;">0</td><td>~1,107 km</td><td>~4,357,449 km&sup2;</td></tr>
                <tr style="background:#f8f8f8;"><td style="padding:2px 4px; text-align:center;">1</td><td>~418 km</td><td>~609,788 km&sup2;</td></tr>
                <tr><td style="padding:2px 4px; text-align:center;">2</td><td>~158 km</td><td>~86,745 km&sup2;</td></tr>
                <tr style="background:#f8f8f8;"><td style="padding:2px 4px; text-align:center;">3</td><td>~59 km</td><td>~12,392 km&sup2;</td></tr>
                <tr><td style="padding:2px 4px; text-align:center;">4</td><td>~22 km</td><td>~1,770 km&sup2;</td></tr>
                <tr style="background:#f8f8f8;"><td style="padding:2px 4px; text-align:center;">5</td><td>~8.3 km</td><td>~252 km&sup2;</td></tr>
                <tr><td style="padding:2px 4px; text-align:center;">6</td><td>~3.1 km</td><td>~36 km&sup2;</td></tr>
                <tr style="background:#f8f8f8;"><td style="padding:2px 4px; text-align:center;">7</td><td>~1.2 km</td><td>~5.2 km&sup2;</td></tr>
                <tr style="background:#e6f3ff;"><td style="padding:2px 4px; text-align:center;"><b>8</b></td><td><b>~460 m</b></td><td><b>~0.74 km&sup2;</b></td></tr>
                <tr style="background:#d4edff;"><td style="padding:2px 4px; text-align:center;"><b>9</b></td><td><b>~174 m</b></td><td><b>~0.1 km&sup2;</b></td></tr>
                <tr style="background:#e6f3ff;"><td style="padding:2px 4px; text-align:center;"><b>10</b></td><td><b>~66 m</b></td><td><b>~0.015 km&sup2;</b></td></tr>
                <tr style="background:#f8f8f8;"><td style="padding:2px 4px; text-align:center;">11</td><td>~25 m</td><td>~0.002 km&sup2;</td></tr>
                <tr><td style="padding:2px 4px; text-align:center;">12</td><td>~9.4 m</td><td>~307 m&sup2;</td></tr>
                <tr style="background:#f8f8f8;"><td style="padding:2px 4px; text-align:center;">13</td><td>~3.6 m</td><td>~44 m&sup2;</td></tr>
                <tr><td style="padding:2px 4px; text-align:center;">14</td><td>~1.3 m</td><td>~6.3 m&sup2;</td></tr>
                <tr style="background:#f8f8f8;"><td style="padding:2px 4px; text-align:center;">15</td><td>~0.5 m</td><td>~0.9 m&sup2;</td></tr>
            </table>
            <p style="color:#888; font-size:9px; margin-top:4px;">
                * Res 8-10 di-highlight &mdash; paling umum digunakan untuk analisis kebencanaan
            </p>
            <hr>
            <h4>Fitur</h4>
            <ul style="padding-left:18px; color:#444;">
                <li><b>Optimized engine</b> &mdash; hanya memproses pixel valid (NoData di-skip otomatis)</li>
                <li><b>Auto-detect</b> resolusi H3 optimal berdasarkan ukuran pixel raster</li>
                <li><b>Hierarchy Builder</b> &mdash; agregasi multi-level dengan styling otomatis</li>
                <li><b>PostgreSQL export</b> &mdash; simpan h3_index + value ke database</li>
            </ul>
            <hr>
            <p style="color:#888; font-size:10px;">
                <b>Plugin:</b> Raster to H3 Converter v1.3<br>
                <b>Developer:</b> Dewa Putu Adikarma Mandala<br>
                <b>AI-assisted by:</b> ChatGPT (GPT-4o) &amp; Claude (Anthropic)<br>
                <b>H3 Library:</b> Uber H3 v3<br>
                <b>Engine:</b> Chunked vectorized (NumPy + Pandas)
            </p>
        """)

        # Add to main layout
        main_layout.addWidget(left_widget, stretch=3)

        # Separator line
        separator = QFrame()
        separator.setFrameShape(QFrame.VLine)
        separator.setFrameShadow(QFrame.Sunken)
        main_layout.addWidget(separator)

        main_layout.addWidget(help_panel, stretch=1)

        # Raster layer selector (single select with QComboBox)
        raster_label = QLabel("Raster Layer:")
        raster_combo = QComboBox()
        raster_names = [layer.name() for layer in layers]
        raster_combo.addItems(raster_names)
        layout.addWidget(raster_label)
        layout.addWidget(raster_combo)

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

            # Use valid_pixels for estimation (optimized method only processes valid pixels)
            pixel_count = self.valid_pixels if self.valid_pixels is not None else self.total_pixels
            nodata_pct = (1 - pixel_count / self.total_pixels) * 100 if self.total_pixels > 0 else 0

            # Optimized method: ~1 sec per 100K valid pixels (base at optimal level)
            # Legacy method was ~10 sec per 1M total pixels
            est_base_per_100k = 1.0  # 1 second per 100K valid pixels
            scaling_factor = 1.3 ** (val - self.optimal_level)  # higher res = more H3 cells
            est_time_sec = pixel_count / 100_000 * est_base_per_100k * scaling_factor
            est_time_sec = max(est_time_sec, 0.5)  # minimum 0.5 sec

            if est_time_sec < 60:
                est_time_str = f"{est_time_sec:.1f} sec"
            else:
                est_time_str = f"{est_time_sec/60:.1f} min"

            # Estimasi area hexagon H3 berdasarkan level slider (copy from update_metadata)
            h3_edge_km = [
                1107, 418, 158, 59, 22, 8.3, 3.1, 1.15,
                0.43, 0.16, 0.06, 0.023, 0.0085, 0.0032, 0.0012, 0.00045
            ]
            edge_length_km = h3_edge_km[val] if val < len(h3_edge_km) else 0.00045
            hex_area = 2.598 * (edge_length_km ** 2)
            hex_area_m2 = hex_area * 1_000_000
            new_hex_area_line = f"• Est. hexagon area : ~{hex_area:.4f} km² / {hex_area_m2:,.0f} m² (level {val})"

            # Replace or append dynamic lines (estimated time, hex area)
            lines = summary_text.toPlainText().splitlines()
            filtered_lines = [line for line in lines
                              if not line.startswith("🕒 Estimated time")
                              and not line.startswith("• Est. hexagon area")
                              and not line.startswith("• Est. duration")]
            filtered_lines.append(f"🕒 Estimated time for level {val}: {est_time_str} (optimized method)")
            filtered_lines.append(new_hex_area_line)
            summary_text.setPlainText("\n".join(filtered_lines))
        def on_slider_change(val):
            res_value.setText(str(val))
            update_estimated_time(val)
            # Update output path based on slider value
            ext = ".geojson" if geom_checkbox.isChecked() else ".csv"
            default_output_path = os.path.join(self._output_folder, f"h3_raster_output_{self._base_name}_{val}{ext}")
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

        # === PostgreSQL Export Option ===
        pg_checkbox = QCheckBox("Also export to PostgreSQL")
        pg_checkbox.setChecked(False)
        layout.addWidget(pg_checkbox)

        pg_group = QGroupBox("PostgreSQL Connection")
        pg_form = QFormLayout()
        pg_host = QLineEdit("localhost")
        pg_port = QLineEdit("5432")
        pg_dbname = QLineEdit("h3_webgis")
        pg_schema = QLineEdit("public")
        pg_table = QLineEdit("h3_raster")
        pg_user = QLineEdit("postgres")
        pg_password = QLineEdit()
        pg_password.setEchoMode(QLineEdit.Password)
        pg_form.addRow("Host:", pg_host)
        pg_form.addRow("Port:", pg_port)
        pg_form.addRow("Database:", pg_dbname)
        pg_form.addRow("Schema:", pg_schema)
        pg_form.addRow("Table:", pg_table)
        pg_form.addRow("Username:", pg_user)
        pg_form.addRow("Password:", pg_password)
        pg_test_btn = QPushButton("Test Connection")
        pg_form.addRow("", pg_test_btn)
        pg_group.setLayout(pg_form)
        pg_group.setVisible(False)
        layout.addWidget(pg_group)

        def toggle_pg_form(state):
            pg_group.setVisible(state == Qt.Checked)

        pg_checkbox.stateChanged.connect(toggle_pg_form)

        def get_pg_params():
            return {
                "host": pg_host.text(),
                "port": pg_port.text(),
                "dbname": pg_dbname.text(),
                "schema": pg_schema.text(),
                "table": pg_table.text(),
                "user": pg_user.text(),
                "password": pg_password.text()
            }

        def test_pg_connection():
            params = get_pg_params()
            try:
                import psycopg2
                conn = psycopg2.connect(
                    host=params["host"],
                    port=params["port"],
                    dbname=params["dbname"],
                    user=params["user"],
                    password=params["password"]
                )
                conn.close()
                summary_text.append("✅ PostgreSQL connection successful!")
            except Exception as e:
                summary_text.append(f"❌ PostgreSQL connection failed: {str(e)}")

        pg_test_btn.clicked.connect(test_pg_connection)

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

                    # Quick NoData scan to count valid pixels (fast with NumPy)
                    try:
                        raster_data = src.read(1)
                        nodata_val = src.nodata
                        if np.issubdtype(raster_data.dtype, np.floating):
                            if nodata_val is not None:
                                valid_mask = (raster_data != nodata_val) & ~np.isnan(raster_data)
                            else:
                                valid_mask = ~np.isnan(raster_data)
                        else:
                            if nodata_val is not None:
                                valid_mask = raster_data != int(nodata_val)
                            else:
                                valid_mask = np.ones(raster_data.shape, dtype=bool)
                        valid_pixels = int(np.count_nonzero(valid_mask))
                        del raster_data, valid_mask  # free memory
                    except Exception:
                        valid_pixels = total_pixels  # fallback: assume all valid

                    self.valid_pixels = valid_pixels
                    nodata_pct = (1 - valid_pixels / total_pixels) * 100 if total_pixels > 0 else 0

                    # Summary tanpa estimasi durasi & hex area (akan diisi oleh update_estimated_time)
                    summary_text.setText(
                        f"=== Raster Metadata Summary ===\n"
                        f"📏 Pixel size       : {res_x:.2f} m x {res_y:.2f} m\n"
                        f"📐 Pixel area       : {pixel_area:.2f} m²\n"
                        f"📄 Raster dimension : {src.width} cols x {src.height} rows\n"
                        f"🔢 Total pixels     : {total_pixels:,}\n"
                        f"✅ Valid pixels     : {valid_pixels:,} ({100 - nodata_pct:.1f}%)\n"
                        f"⬜ NoData pixels    : {total_pixels - valid_pixels:,} ({nodata_pct:.1f}%) — will be skipped\n"
                        f"💾 File size        : {file_size_str}\n"
                        f"{'='*40}\n"
                        f"📝 Important Notes\n"
                        f"• H3 recommendation : Min {min_level}, Max {max_level}, Optimal {optimal_level}\n"
                        f"\n"
                        f"ℹ️ Only {valid_pixels:,} valid pixels will be processed (NoData skipped automatically)."
                    )
                    # Store total_pixels and optimal_level for later use
                    self.total_pixels = total_pixels
                    self.optimal_level = optimal_level
            except Exception as e:
                summary_text.setText(f"Failed to read raster metadata: {str(e)}")
            # After reading tif_path, set up output folder, base_name, etc.
            self._input_folder = os.path.dirname(tif_path)
            # Check if folder is writable, otherwise fallback to ~/H3_Outputs
            if not os.access(self._input_folder, os.W_OK):
                self._input_folder = os.path.expanduser("~/H3_Outputs")
            self._base_name = os.path.splitext(os.path.basename(tif_path))[0]
            self._output_folder = os.path.join(self._input_folder, "H3 Output")
            os.makedirs(self._output_folder, exist_ok=True)
            ext = ".geojson" if geom_checkbox.isChecked() else ".csv"
            default_output_path = os.path.join(self._output_folder, f"h3_raster_output_{self._base_name}_{res_slider.value()}{ext}")
            output_input.setText(default_output_path)
            # Update estimated time after updating metadata
            update_estimated_time(res_slider.value())

        # Connect raster_combo index change to update_metadata
        raster_combo.currentIndexChanged.connect(update_metadata)
        # Initial metadata update
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
            new_output_path = os.path.join(self._output_folder, f"h3_raster_output_{self._base_name}_{val}{ext}")
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
            import time as _time
            total_start_time = _time.time()
            summary_text.append("🔄 Starting processing... Please wait while we convert the raster to H3 grid.")
            summary_text.append("──────────────────────────────────────────────────────────────")
            log_message("🔄 Starting H3 raster conversion process...")

            selected_layer = layers[raster_combo.currentIndex()]
            resolution = res_slider.value()
            include_geom = geom_checkbox.isChecked()
            show_layer = show_layer_checkbox.isChecked()
            output_folder_local = getattr(self, '_output_folder', os.path.expanduser("~"))

            try:
                progress_bar.setValue(0)
                tif_path = selected_layer.source()
                base_name_local = os.path.splitext(os.path.basename(tif_path))[0]
                output_path = os.path.join(output_folder_local, f"h3_raster_output_{base_name_local}_{resolution}{'.geojson' if include_geom else '.csv'}")

                summary_text.append(f"\n▶️ Processing layer: {selected_layer.name()}")
                log_message(f"📥 Reading raster file for {selected_layer.name()} ...")
                log_message("📊 Converting raster pixels into H3 hexagons...")
                gdf = self.raster_to_h3(
                    tif_path, resolution, include_geom, summary_text, progress_bar
                )
                # Check for cancel
                if hasattr(self, "cancel_requested") and self.cancel_requested:
                    log_message("⚠️ Process cancelled by user.")
                    self.cancel_button.setVisible(False)
                    cancel_button.setVisible(True)
                    return
                log_message("✅ Extraction complete.")
                log_message(f"💾 Writing output file ({len(gdf):,} features)...")
                QApplication.processEvents()

                import time as _time
                save_start = _time.time()

                if include_geom:
                    log_message("   Format: GeoJSON (with geometry)")
                    QApplication.processEvents()
                    gdf.to_file(output_path, driver='GeoJSON')
                else:
                    log_message("   Format: CSV (centroid coordinates)")
                    QApplication.processEvents()
                    # Vectorized CSV export (jauh lebih cepat dari iterrows)
                    h3_indices_list = gdf['h3_index'].tolist()
                    coords = [h3.h3_to_geo(idx) for idx in h3_indices_list]
                    lats = [c[0] for c in coords]
                    lons = [c[1] for c in coords]
                    import pandas as pd
                    csv_df = pd.DataFrame({
                        'h3_index': h3_indices_list,
                        'value': gdf['value'].tolist(),
                        'longitude': lons,
                        'latitude': lats
                    })
                    csv_df.to_csv(output_path, index=False)

                save_elapsed = _time.time() - save_start
                file_size = os.path.getsize(output_path)
                file_size_str = f"{file_size / 1024:.1f} KB" if file_size < 1024 * 1024 else f"{file_size / 1024 / 1024:.1f} MB"
                log_message(f"✅ Output file saved: {file_size_str} ({save_elapsed:.1f}s)")
                log_message(f"   Path: {output_path}")

                # --- PostgreSQL Export ---
                if pg_checkbox.isChecked():
                    log_message("🐘 Exporting to PostgreSQL...")
                    try:
                        pg_params = get_pg_params()
                        pg_rows = self.export_to_postgresql(
                            gdf, pg_params, resolution, selected_layer.name(), log_message
                        )
                        log_message(f"✅ PostgreSQL export complete: {pg_rows} rows inserted.")
                    except Exception as pg_err:
                        log_message(f"❌ PostgreSQL export failed: {str(pg_err)}")

                if show_layer:
                    log_message("🗺️ Loading H3 layer to QGIS canvas...")
                    QApplication.processEvents()
                    vlayer = QgsVectorLayer(output_path, f"H3 Raster ({selected_layer.name()})", "ogr")
                    QgsProject.instance().addMapLayer(vlayer)
                    log_message("🗺️ H3 layer added to canvas.")

                total_elapsed = _time.time() - total_start_time
                if total_elapsed < 60:
                    elapsed_str = f"{total_elapsed:.1f} sec"
                else:
                    elapsed_str = f"{total_elapsed / 60:.1f} min"

                log_message("\n=== Raster to H3 Extraction Summary ===")
                log_message(f"📦 Raster file     : {tif_path}")
                log_message(f"🧮 H3 resolution   : {resolution}")
                log_message(f"📊 Total H3 cells  : {len(gdf)}")
                log_message(f"⏱️ Total time      : {elapsed_str}")
                # Show additional notification dialog with total hexagons and ask about hierarchy
                reply = QMessageBox.question(
                    None,
                    "Processing Complete",
                    f"Raster conversion complete for '{selected_layer.name()}'.\nTotal H3 hexagons: {len(gdf)}\n\nWould you like to open the H3 Hierarchy Builder to continue?",
                    QMessageBox.Yes | QMessageBox.No
                )
                if reply == QMessageBox.Yes:
                    try:
                        from .h3_hierarchy_builder import HierarchyDialog
                        dlg = HierarchyDialog()
                        dlg.exec_()
                    except Exception as e:
                        QMessageBox.warning(None, "Hierarchy Error", f"Failed to open hierarchy builder: {str(e)}")

                self.cancel_button.setVisible(False)
                cancel_button.setVisible(True)
                buttons.clear()
                close_button = buttons.addButton("Close", QDialogButtonBox.RejectRole)
                close_button.clicked.connect(dialog.reject)
            except Exception as e:
                self.cancel_button.setVisible(False)
                cancel_button.setVisible(True)
                QMessageBox.critical(None, "Error", str(e))

        dialog.setLayout(main_layout)
        try:
            dialog.exec_()
        except Exception as e:
            import traceback
            error_msg = traceback.format_exc()
            QMessageBox.critical(None, "Plugin Error", f"Unexpected error occurred:\n\n{error_msg}")

    def raster_to_h3(self, tif_path, resolution, include_geom=True, summary_text=None, progress_bar=None):
        """
        Convert raster pixels to H3 hexagonal grid.
        Uses optimized chunked-vectorized approach with fallback to legacy per-pixel method.
        """
        import os
        import datetime
        import pandas as pd

        log_path = os.path.join(os.path.expanduser("~"), "h3_conversion.log")

        def log(msg):
            if summary_text:
                summary_text.append(msg)
                QApplication.processEvents()
            timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with open(log_path, "a") as f:
                f.write(f"[{timestamp}] {msg}\n")

        try:
            gdf = self._raster_to_h3_optimized(
                tif_path, resolution, include_geom, log, progress_bar
            )
            return gdf
        except Exception as e:
            log(f"⚠️ Optimized method failed: {str(e)}")
            log("🔄 Falling back to legacy per-pixel method...")
            return self._raster_to_h3_legacy(
                tif_path, resolution, include_geom, summary_text, progress_bar
            )

    def _raster_to_h3_optimized(self, tif_path, resolution, include_geom, log_fn, progress_bar):
        """
        Optimized raster-to-H3 conversion using chunked vectorization.
        - NumPy batch NoData filtering
        - Batch coordinate generation
        - Chunked CRS transform (500K pixels per chunk)
        - Pandas groupby aggregation
        """
        import pandas as pd
        import time as _time
        CHUNK_SIZE = 500_000

        with rasterio.open(tif_path) as src:
            raster = src.read(1)
            src_transform = src.transform
            nodata = src.nodata
            src_crs = src.crs

            # === Tahap 1: Safe NoData Filter ===
            t1 = _time.time()
            log_fn("📊 [1/5] Filtering valid pixels...")
            if progress_bar:
                progress_bar.setValue(5)

            # Build valid mask safely based on dtype
            if np.issubdtype(raster.dtype, np.floating):
                # Float raster: check both nodata and NaN
                if nodata is not None:
                    valid_mask = (raster != nodata) & ~np.isnan(raster)
                else:
                    valid_mask = ~np.isnan(raster)
            else:
                # Integer raster: no NaN possible
                if nodata is not None:
                    valid_mask = raster != int(nodata)
                else:
                    valid_mask = np.ones(raster.shape, dtype=bool)

            rows_idx, cols_idx = np.where(valid_mask)
            values = raster[rows_idx, cols_idx].astype(np.float64)
            total_valid = len(values)

            log_fn(f"   Total pixels: {raster.shape[0] * raster.shape[1]:,}")
            log_fn(f"   Valid pixels: {total_valid:,}")
            log_fn(f"   Skipped (NoData/NaN): {raster.shape[0] * raster.shape[1] - total_valid:,}")

            if total_valid == 0:
                log_fn("⚠️ No valid pixels found.")
                return gpd.GeoDataFrame(columns=["h3_index", "value"], crs="EPSG:4326")

            log_fn(f"   Done in {_time.time() - t1:.1f}s")

            # === Tahap 2: Batch Coordinate Generation ===
            t2 = _time.time()
            log_fn("📐 [2/5] Generating pixel coordinates (batch)...")
            if progress_bar:
                progress_bar.setValue(15)

            xs, ys = rasterio.transform.xy(src_transform, rows_idx, cols_idx, offset='center')
            xs = np.array(xs, dtype=np.float64)
            ys = np.array(ys, dtype=np.float64)

            log_fn(f"   Done in {_time.time() - t2:.1f}s")

            # === Tahap 3: Chunked CRS Transform ===
            t3 = _time.time()
            need_transform = str(src_crs) != 'EPSG:4326'
            n_chunks = max(1, (total_valid + CHUNK_SIZE - 1) // CHUNK_SIZE)
            log_fn(f"🌐 [3/5] CRS transform → EPSG:4326 ({'chunked: ' + str(n_chunks) + ' batches' if need_transform else 'already EPSG:4326'})...")

            all_lons = np.empty(total_valid, dtype=np.float64)
            all_lats = np.empty(total_valid, dtype=np.float64)

            for i in range(n_chunks):
                # Cancel check per chunk
                if hasattr(self, 'cancel_requested') and self.cancel_requested:
                    log_fn("⚠️ Process cancelled by user.")
                    return gpd.GeoDataFrame(columns=["h3_index", "value"], crs="EPSG:4326")

                start = i * CHUNK_SIZE
                end = min((i + 1) * CHUNK_SIZE, total_valid)

                if need_transform:
                    chunk_lons, chunk_lats = warp_transform(
                        src_crs, 'EPSG:4326',
                        xs[start:end].tolist(),
                        ys[start:end].tolist()
                    )
                    all_lons[start:end] = chunk_lons
                    all_lats[start:end] = chunk_lats
                else:
                    all_lons[start:end] = xs[start:end]
                    all_lats[start:end] = ys[start:end]

                if progress_bar:
                    progress = 15 + int((i + 1) / n_chunks * 35)
                    progress_bar.setValue(progress)

                if n_chunks > 1:
                    log_fn(f"   Chunk {i+1}/{n_chunks}: {end - start:,} pixels transformed")
                    QApplication.processEvents()

            log_fn(f"   Done in {_time.time() - t3:.1f}s")

            # === Tahap 4: H3 Convert + Aggregasi ===
            t4 = _time.time()
            log_fn(f"🔷 [4/5] Converting {total_valid:,} pixels to H3 (resolution {resolution})...")
            if progress_bar:
                progress_bar.setValue(55)

            # H3 conversion in chunks with progress + cancel support
            h3_indices = []
            h3_chunk_size = CHUNK_SIZE
            n_h3_chunks = max(1, (total_valid + h3_chunk_size - 1) // h3_chunk_size)

            for i in range(n_h3_chunks):
                # Cancel check
                if hasattr(self, 'cancel_requested') and self.cancel_requested:
                    log_fn("⚠️ Process cancelled by user.")
                    return gpd.GeoDataFrame(columns=["h3_index", "value"], crs="EPSG:4326")

                start = i * h3_chunk_size
                end = min((i + 1) * h3_chunk_size, total_valid)

                chunk_h3 = [
                    h3.geo_to_h3(float(all_lats[j]), float(all_lons[j]), resolution)
                    for j in range(start, end)
                ]
                h3_indices.extend(chunk_h3)

                if progress_bar:
                    progress = 55 + int((i + 1) / n_h3_chunks * 30)
                    progress_bar.setValue(progress)

                if n_h3_chunks > 1:
                    log_fn(f"   H3 chunk {i+1}/{n_h3_chunks}: {end - start:,} pixels converted")
                    QApplication.processEvents()

            # Aggregate using pandas groupby (much faster than manual dict)
            log_fn("📈 Aggregating values per H3 cell (pandas groupby)...")
            df = pd.DataFrame({
                'h3_index': h3_indices,
                'value': values
            })

            # Filter out invalid H3 indices (empty string or None)
            df = df[df['h3_index'].astype(str).str.len() > 0]

            result = df.groupby('h3_index', as_index=False)['value'].mean()
            unique_cells = len(result)
            log_fn(f"   Unique H3 cells: {unique_cells:,}")
            log_fn(f"   Compression ratio: {total_valid:,} pixels → {unique_cells:,} cells ({total_valid / max(1, unique_cells):.1f}:1)")
            log_fn(f"   Done in {_time.time() - t4:.1f}s")

            # === Tahap 5: Build GeoDataFrame ===
            t5 = _time.time()
            if include_geom:
                total_geom = len(result)
                log_fn(f"🔷 [5/5] Generating {total_geom:,} hexagon geometries...")
                if progress_bar:
                    progress_bar.setValue(88)
                QApplication.processEvents()

                geometries = []
                log_interval = max(1, total_geom // 5)  # log setiap 20%
                for idx, row in result.iterrows():
                    boundary = h3.h3_to_geo_boundary(row['h3_index'], geo_json=True)
                    geometries.append(shape({
                        "type": "Polygon",
                        "coordinates": [boundary]
                    }))
                    # Progress feedback per 20%
                    count = idx + 1
                    if count % log_interval == 0 or count == total_geom:
                        pct = count / total_geom * 100
                        if progress_bar:
                            progress_bar.setValue(88 + int(pct * 0.10))  # 88-98%
                        log_fn(f"   Geometries: {count:,}/{total_geom:,} ({pct:.0f}%)")
                        QApplication.processEvents()

                result['geometry'] = geometries

            gdf = gpd.GeoDataFrame(result, crs="EPSG:4326")
            log_fn(f"   Done in {_time.time() - t5:.1f}s")

            if progress_bar:
                progress_bar.setValue(100)

            log_fn(f"📦 GeoDataFrame created: {len(gdf):,} features")
            log_fn(f"✅ Optimized conversion complete.")
            QApplication.processEvents()
            return gdf

    def _raster_to_h3_legacy(self, tif_path, resolution, include_geom=True, summary_text=None, progress_bar=None):
        """
        Legacy per-pixel raster-to-H3 conversion (fallback method).
        Slower but proven reliable.
        """
        import os
        import datetime
        h3_data = {}
        with rasterio.open(tif_path) as src:
            raster = src.read(1)
            transform = src.transform
            nodata = src.nodata
            h3_res = resolution

            for row in range(raster.shape[0]):
                if hasattr(self, 'cancel_requested') and self.cancel_requested:
                    if summary_text:
                        summary_text.append("⚠️ Process cancelled by user.")
                    break
                for col in range(raster.shape[1]):
                    value = raster[row, col]
                    if nodata is not None and value == nodata:
                        continue
                    try:
                        if np.isnan(value):
                            continue
                    except (TypeError, ValueError):
                        pass

                    x, y = rasterio.transform.xy(transform, row, col, offset='center')
                    lon, lat = warp_transform(src.crs, 'EPSG:4326', [x], [y])
                    lon = lon[0]
                    lat = lat[0]
                    h3_index = h3.geo_to_h3(lat, lon, h3_res)

                    if h3_index not in h3_data:
                        h3_data[h3_index] = []
                    h3_data[h3_index].append(value)

                if row % 10 == 0 and progress_bar is not None and summary_text is not None:
                    progress = int(row / raster.shape[0] * 100)
                    progress_bar.setValue(progress)
                    msg = f"⏳ [Legacy] Processing row {row}/{raster.shape[0]}"
                    summary_text.append(msg)
                    QApplication.processEvents()
                    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    log_path = os.path.join(os.path.expanduser("~"), "h3_conversion.log")
                    with open(log_path, "a") as f:
                        f.write(f"[{timestamp}] {msg}\n")

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

    def export_to_postgresql(self, gdf, pg_params, resolution, source_name, log_fn=None):
        """
        Export H3 data (h3_index + value) to PostgreSQL.
        Only stores index and value — geometry is generated on-the-fly
        by h3-pg extension in PostgreSQL.

        Returns number of rows inserted.
        """
        import psycopg2
        from psycopg2.extras import execute_values

        schema = pg_params.get("schema", "public")
        table = pg_params.get("table", "h3_raster")
        # Sanitize schema/table names (allow only alphanumeric + underscore)
        import re
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', schema):
            raise ValueError(f"Invalid schema name: {schema}")
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table):
            raise ValueError(f"Invalid table name: {table}")

        conn = psycopg2.connect(
            host=pg_params["host"],
            port=pg_params["port"],
            dbname=pg_params["dbname"],
            user=pg_params["user"],
            password=pg_params["password"]
        )
        cur = conn.cursor()

        # Create schema if not exists
        cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')

        # Create table if not exists
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS "{schema}"."{table}" (
                h3_index TEXT NOT NULL,
                value DOUBLE PRECISION,
                resolution INTEGER,
                source_file TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (h3_index, source_file)
            )
        """)

        if log_fn:
            log_fn(f"🐘 Table \"{schema}\".\"{table}\" ready. Inserting {len(gdf)} rows...")

        # Prepare data tuples
        data = [
            (row["h3_index"], float(row["value"]), resolution, source_name)
            for _, row in gdf.iterrows()
        ]

        # Bulk insert with ON CONFLICT upsert
        insert_sql = f"""
            INSERT INTO "{schema}"."{table}" (h3_index, value, resolution, source_file)
            VALUES %s
            ON CONFLICT (h3_index, source_file)
            DO UPDATE SET value = EXCLUDED.value,
                          resolution = EXCLUDED.resolution,
                          created_at = NOW()
        """
        execute_values(cur, insert_sql, data, page_size=5000)

        conn.commit()
        row_count = len(data)
        cur.close()
        conn.close()

        return row_count
