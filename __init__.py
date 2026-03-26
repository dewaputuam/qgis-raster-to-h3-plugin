# __init__.py
# QGIS Plugin Entry Point

def classFactory(iface):
    from .raster_to_h3_plugin import RasterToH3Plugin
    return RasterToH3Plugin(iface)