/* Overviewer.js
 *
 * Must be the first file included from index.html
 */


var overviewer = {};


/**
 * This holds the map, probably the most important var in this file
 */
overviewer.map = null;
overviewer.mapView = null;


overviewer.collections = {
        /**
         * MapTypes that aren't overlays will end up in here.
         */
        'mapTypes':     {},
        /**
         * The mapType names are in here.
         */
        'mapTypeIds':   [],
        /**
         * This is the current infoWindow object, we keep track of it so that
         * there is only one open at a time.
         */
        'infoWindow':   null,

        'worldViews': [],

        'haveSigns': false,

        /**
         * Hold the raw marker data for each tilest
         */
        'markerInfo': {},

        /**
         * holds a reference to the spawn marker. 
         */
        'spawnMarker': null,
    };

overviewer.classes = {
        /**
         * Our custom projection maps Latitude to Y, and Longitude to X as
         * normal, but it maps the range [0.0, 1.0] to [0, tileSize] in both
         * directions so it is easier to position markers, etc. based on their
         * position (find their position in the lowest-zoom image, and divide
         * by tileSize)
         */
        'MapProjection' : function() {
            this.inverseTileSize = 1.0 / overviewerConfig.CONST.tileSize;
        },
        /**
         * This is a mapType used only for debugging, to draw a grid on the screen
         * showing the tile co-ordinates and tile path. Currently the tile path
         * part does not work.
         * 
         * @param google.maps.Size tileSize
         */
        'CoordMapType': function(tileSize) {
            this.tileSize = tileSize;
        }

};


overviewer.gmap = {

        /**
         * Generate a function to get the path to a tile at a particular location
         * and zoom level.
         * 
         * @param string path
         * @param string pathBase
         * @param string pathExt
         */
        'getTileUrlGenerator': function(path, pathBase, pathExt) {
            return function(tile, zoom) {
                var url = path;
                var urlBase = ( pathBase ? pathBase : '' );
                if(tile.x < 0 || tile.x >= Math.pow(2, zoom) ||
                   tile.y < 0 || tile.y >= Math.pow(2, zoom)) {
                    url += '/blank';
                } else if(zoom == 0) {
                    url += '/base';
                } else {
                    for(var z = zoom - 1; z >= 0; --z) {
                        var x = Math.floor(tile.x / Math.pow(2, z)) % 2;
                        var y = Math.floor(tile.y / Math.pow(2, z)) % 2;
                        url += '/' + (x + 2 * y);
                    }
                }
                url = url + '.' + pathExt;
                if(typeof overviewerConfig.map.cacheTag !== 'undefined') {
                    url += '?c=' + overviewerConfig.map.cacheTag;
                }
                return(urlBase + url);
            }
        }
};
overviewer.models = {};

/* WorldModel
 * Primarily has a collection of TileSets
 */
overviewer.models.WorldModel = Backbone.Model.extend({
    initialize: function(attrs) {
        attrs.tileSets = new overviewer.models.TileSetCollection();
        this.set(attrs);
    }
});


/* WorldCollection
 * A collection of WorldModels
 */
overviewer.models.WorldCollection = Backbone.Collection.extend({
    model: overviewer.models.WorldModel
});


/* TileSetModel
 */
overviewer.models.TileSetModel = Backbone.Model.extend({
    defaults: {
        markers: [] ,
    },
    initialize: function(attrs) {
        // this implies that the Worlds collection must be
        // initialized before any TIleSetModels are created
        attrs.world = overviewer.collections.worlds.get(attrs.world);
        this.set(attrs);
    },
});

overviewer.models.TileSetCollection = Backbone.Collection.extend({
    model: overviewer.models.TileSetModel
});


overviewer.models.GoogleMapModel = Backbone.Model.extend({
    initialize: function(attrs) {
        attrs.currentWorldView = overviewer.collections.worldViews[0];
        this.set(attrs);
    },
});

overviewer.util = {
    /* fuzz tester!
     */
    'testMaths': function(t) {
        var initx = Math.floor(Math.random() * 400) - 200;
        var inity = 64;
        var initz = Math.floor(Math.random() * 400) - 200;
        console.log("Initial point: %r,%r,%r", initx, inity, initz);

        var latlng = overviewer.util.fromWorldToLatLng(initx, inity, initz, t);
        console.log("LatLng: %r,%r", latlng.lat(), latlng.lng());

        var p = overviewer.util.fromLatLngToWorld(latlng.lat(), latlng.lng(), t);
        console.log("Result: %r,%r,%r", p.x, p.y, p.z);
        if (p.x == initx && p.y == inity && p.z == initz) {
            console.log("Pass");
        }


    },

    /**
     * General initialization function, called when the page is loaded.
     * Probably shouldn't need changing unless some very different kind of new
     * feature gets added.
     */
    'initialize': function() {
        overviewer.util.initializeClassPrototypes();

        overviewer.collections.worlds = new overviewer.models.WorldCollection();

        $.each(overviewerConfig.worlds, function(index, el) {
                var n = new overviewer.models.WorldModel({name: el, id:el});
                overviewer.collections.worlds.add(n);
                });

        $.each(overviewerConfig.tilesets, function(index, el) {
                var newTset = new overviewer.models.TileSetModel(el);
                overviewer.collections.worlds.get(el.world).get("tileSets").add(newTset);
                });

        overviewer.collections.worlds.each(function(world, index, list) {
                var nv = new overviewer.views.WorldView({model: world});
                overviewer.collections.worldViews.push(nv);
                });

        overviewer.mapModel = new overviewer.models.GoogleMapModel({});
        overviewer.mapView = new overviewer.views.GoogleMapView({el: document.getElementById(overviewerConfig.CONST.mapDivId), model:overviewer.mapModel});

        // any controls must be created after the GoogleMapView is created
        // controls should be added in the order they should appear on screen, 
        // with controls on the outside of the page being added first

        var compass = new overviewer.views.CompassView({tagName: 'DIV', model:overviewer.mapModel});
        // no need to render the compass now.  it's render event will get fired by
        // the maptypeid_chagned event

        var coordsdiv = new overviewer.views.CoordboxView({tagName: 'DIV'});
        coordsdiv.render();

        if (overviewer.collections.haveSigns) {
            var signs = new overviewer.views.SignControlView();
            signs.registerEvents(signs);
        }

        var spawnmarker = new overviewer.views.SpawnIconView();

        // Update coords on mousemove
        google.maps.event.addListener(overviewer.map, 'mousemove', function (event) {
            coordsdiv.updateCoords(event.latLng);    
        });
        google.maps.event.addListener(overviewer.map, 'idle', function (event) {
            overviewer.util.updateHash();
        });

        google.maps.event.addListener(overviewer.map, 'maptypeid_changed', function(event) {
            // it's handy to keep track of the currently visible tileset.  we let
            // the GoogleMapView manage this
            overviewer.mapView.updateCurrentTileset();

            compass.render();
            spawnmarker.render();

            // re-center on the last viewport
            var currentWorldView = overviewer.mapModel.get("currentWorldView");
            if (currentWorldView.options.lastViewport) {
                var x = currentWorldView.options.lastViewport[0];
                var y = currentWorldView.options.lastViewport[1];
                var z = currentWorldView.options.lastViewport[2];
                var zoom = currentWorldView.options.lastViewport[3];

                var latlngcoords = overviewer.util.fromWorldToLatLng(x, y, z,
                    overviewer.mapView.options.currentTileSet);
                overviewer.map.setCenter(latlngcoords);

                if (zoom == 'max') {
                    zoom = overviewer.mapView.options.currentTileSet.get('maxZoom');
                } else if (zoom == 'min') {
                    zoom = overviewer.mapView.options.currentTileSet.get('minZoom');
                } else {
                    zoom = parseInt(zoom);
                    if (zoom < 0 && zoom + overviewer.mapView.options.currentTileSet.get('maxZoom') >= 0) {
                        // if zoom is negative, treat it as a "zoom out from max"
                        zoom += overviewer.mapView.options.currentTileSet.get('maxZoom');
                    } else {
                        // fall back to default zoom
                        zoom = overviewer.mapView.options.currentTileSet.get('defaultZoom');
                    }
                }
                overviewer.map.setZoom(zoom);
            }


        });

        var worldSelector = new overviewer.views.WorldSelectorView({tagName:'DIV'});
        overviewer.collections.worlds.bind("add", worldSelector.render, worldSelector);

        // hook up some events

        overviewer.mapModel.bind("change:currentWorldView", overviewer.mapView.render, overviewer.mapView);

        overviewer.mapView.render();
         
        // Jump to the hash if given
        overviewer.util.initHash();

        overviewer.util.initializeMarkers();

        /*
           overviewer.util.initializeMapTypes();
           overviewer.util.initializeMap();
           overviewer.util.initializeRegions();
           overviewer.util.createMapControls();
           */
    },

    'injectMarkerScript': function(url) {
        var m = document.createElement('script'); m.type = 'text/javascript'; m.async = false;
        m.src = url;
        var s = document.getElementsByTagName('script')[0]; s.parentNode.appendChild(m);
    },

    'initializeMarkers': function() {
        return;

    },

    'createMarkerInfoWindow': function(marker) {
            var windowContent = '<div class="infoWindow"><img src="' + marker.icon +
                '"/><p>' + marker.title.replace(/\n/g,'<br/>') + '</p></div>';
            var infowindow = new google.maps.InfoWindow({
                'content': windowContent
            });
            google.maps.event.addListener(marker, 'click', function() {
                if (overviewer.collections.infoWindow) {
                    overviewer.collections.infoWindow.close();
                }
                infowindow.open(overviewer.map, marker);
                overviewer.collections.infoWindow = infowindow;
            });
        },


    /**
     * This adds some methods to these classes because Javascript is stupid
     * and this seems like the best way to avoid re-creating the same methods
     * on each object at object creation time.
     */
    'initializeClassPrototypes': function() {
        overviewer.classes.MapProjection.prototype.fromLatLngToPoint = function(latLng) {
            var x = latLng.lng() * overviewerConfig.CONST.tileSize;
            var y = latLng.lat() * overviewerConfig.CONST.tileSize;
            return new google.maps.Point(x, y);
        };

        overviewer.classes.MapProjection.prototype.fromPointToLatLng = function(point) {
            var lng = point.x * this.inverseTileSize;
            var lat = point.y * this.inverseTileSize;
            return new google.maps.LatLng(lat, lng);
        };

        overviewer.classes.CoordMapType.prototype.getTile = function(coord, zoom, ownerDocument) {
            var div = ownerDocument.createElement('DIV');
            div.innerHTML = '(' + coord.x + ', ' + coord.y + ', ' + zoom +
                ')' + '<br />';
            //TODO: figure out how to get the current mapType, I think this
            //will add the maptile url to the grid thing once it works

            //div.innerHTML += overviewer.collections.mapTypes[0].getTileUrl(coord, zoom);

            //this should probably just have a css class
            div.style.width = this.tileSize.width + 'px';
            div.style.height = this.tileSize.height + 'px';
            div.style.fontSize = '10px';
            div.style.borderStyle = 'solid';
            div.style.borderWidth = '1px';
            div.style.borderColor = '#AAAAAA';
            return div;
        };
    },
    /**
     * Quote an arbitrary string for use in a regex matcher.
     * WTB parametized regexes, JavaScript...
     *
     *   From http://kevin.vanzonneveld.net
     *   original by: booeyOH
     *   improved by: Ates Goral (http://magnetiq.com)
     *   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
     *   bugfixed by: Onno Marsman
     *     example 1: preg_quote("$40");
     *     returns 1: '\$40'
     *     example 2: preg_quote("*RRRING* Hello?");
     *     returns 2: '\*RRRING\* Hello\?'
     *     example 3: preg_quote("\\.+*?[^]$(){}=!<>|:");
     *     returns 3: '\\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:'
     */
    "pregQuote": function(str) {
        return (str+'').replace(/([\\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:])/g, "\\$1");
    },
    /**
     * Change the map's div's background color according to the mapType's bg_color setting
     *
     * @param string mapTypeId
     * @return string
     */
    'getMapTypeBackgroundColor': function(id) {
        return overviewerConfig.tilesets[id].bgcolor;
    },
    /**
     * Gee, I wonder what this does.
     * 
     * @param string msg
     */
    'debug': function(msg) {
        if (overviewerConfig.map.debug) {
            console.log(msg);
        }
    },
    /**
     * Simple helper function to split the query string into key/value
     * pairs. Doesn't do any type conversion but both are lowercase'd.
     * 
     * @return Object
     */
    'parseQueryString': function() {
        var results = {};
        var queryString = location.search.substring(1);
        var pairs = queryString.split('&');
        for (i in pairs) {
            var pos = pairs[i].indexOf('=');
            var key = pairs[i].substring(0,pos).toLowerCase();
            var value = pairs[i].substring(pos+1).toLowerCase();
            overviewer.util.debug( 'Found GET paramter: ' + key + ' = ' + value);
            results[key] = value;
        }
        return results;
    },
    'getDefaultMapTypeId': function() {
        return overviewer.collections.mapTypeIds[0];
    },
    /**
     * helper to get map LatLng from world coordinates takes arguments in
     * X, Y, Z order (arguments are *out of order*, because within the
     * function we use the axes like the rest of Minecraft Overviewer --
     * with the Z and Y flipped from normal minecraft usage.)
     * 
     * @param int x
     * @param int z
     * @param int y
     * @param TileSetModel model
     * 
     * @return google.maps.LatLng
     */
    'fromWorldToLatLng': function(x, y, z, model) {

        var zoomLevels = model.get("zoomLevels");
        var north_direction = model.get('north_direction');

        // the width and height of all the highest-zoom tiles combined,
        // inverted
        var perPixel = 1.0 / (overviewerConfig.CONST.tileSize *
                Math.pow(2, zoomLevels));

        if (north_direction == overviewerConfig.CONST.UPPERRIGHT){
            temp = x;
            x = -z+16;
            z = temp;
        } else if(north_direction == overviewerConfig.CONST.LOWERRIGHT){
            x = -x+16;
            z = -z+16;
        } else if(north_direction == overviewerConfig.CONST.LOWERLEFT){
            temp = x;
            x = z;
            z = -temp+16;
        }

        // This information about where the center column is may change with
        // a different drawing implementation -- check it again after any
        // drawing overhauls!

        // point (0, 0, 127) is at (0.5, 0.0) of tile (tiles/2 - 1, tiles/2)
        // so the Y coordinate is at 0.5, and the X is at 0.5 -
        // ((tileSize / 2) / (tileSize * 2^zoomLevels))
        // or equivalently, 0.5 - (1 / 2^(zoomLevels + 1))
        var lng = 0.5 - (1.0 / Math.pow(2, zoomLevels + 1));
        var lat = 0.5;

        // the following metrics mimic those in
        // chunk_render in src/iterate.c

        // each block on X axis adds 12px to x and subtracts 6px from y
        lng += 12 * x * perPixel;
        lat -= 6 * x * perPixel;

        // each block on Y axis adds 12px to x and adds 6px to y
        lng += 12 * z * perPixel;
        lat += 6 * z * perPixel;

        // each block down along Z adds 12px to y
        lat += 12 * (256 - y) * perPixel;

        // add on 12 px to the X coordinate to center our point
        lng += 12 * perPixel;

        return new google.maps.LatLng(lat, lng);
    },
    /**
     * The opposite of fromWorldToLatLng
     * NOTE: X, Y and Z in this function are Minecraft world definitions
     * (that is, X is horizontal, Y is altitude and Z is vertical).
     * 
     * @param float lat
     * @param float lng
     * 
     * @return Array
     */
    'fromLatLngToWorld': function(lat, lng, model) {
        var zoomLevels = model.get("zoomLevels");
        var north_direction = model.get("north_direction");

        // Initialize world x/y/z object to be returned
        var point = Array();
        point.x = 0;
        point.y = 64;
        point.z = 0;

        // the width and height of all the highest-zoom tiles combined,
        // inverted
        var perPixel = 1.0 / (overviewerConfig.CONST.tileSize *
                Math.pow(2, zoomLevels));

        // Revert base positioning
        // See equivalent code in fromWorldToLatLng()
        lng -= 0.5 - (1.0 / Math.pow(2, zoomLevels + 1));
        lat -= 0.5;

        // I'll admit, I plugged this into Wolfram Alpha:
        //   a = (x * 12 * r) + (z * 12 * r), b = (z * 6 * r) - (x * 6 * r)
        // And I don't know the math behind solving for for X and Z given
        // A (lng) and B (lat).  But Wolfram Alpha did. :)  I'd welcome
        // suggestions for splitting this up into long form and documenting
        // it. -RF
        point.x = Math.floor((lng - 2 * lat) / (24 * perPixel));
        point.z = Math.floor((lng + 2 * lat) / (24 * perPixel));

        // Adjust for the fact that we we can't figure out what Y is given
        // only latitude and longitude, so assume Y=64. Since this is lowering
        // down from the height of a chunk, it depends on the chunk height as
        // so:
        point.x += 256-64;
        point.z -= 256-64;

        if(north_direction == overviewerConfig.CONST.UPPERRIGHT){
            temp = point.z;
            point.z = -point.x+16;
            point.x = temp;
        } else if(north_direction == overviewerConfig.CONST.LOWERRIGHT){
            point.x = -point.x+16;
            point.z = -point.z+16;
        } else if(north_direction == overviewerConfig.CONST.LOWERLEFT){
            temp = point.z;
            point.z = point.x;
            point.x = -temp+16;
        }

        return point;
    },
    /**
     * Create the pop-up infobox for when you click on a region, this can't
     * be done in-line because of stupid Javascript scoping problems with
     * closures or something.
     * 
     * @param google.maps.Polygon|google.maps.Polyline shape
     */
    'createRegionInfoWindow': function(shape) {
        var infowindow = new google.maps.InfoWindow();
        google.maps.event.addListener(shape, 'click', function(event, i) {
                if (overviewer.collections.infoWindow) {
                overviewer.collections.infoWindow.close();
                }
                // Replace our Info Window's content and position
                var point = overviewer.util.fromLatLngToWorld(event.latLng.lat(),event.latLng.lng());
                var contentString = '<b>Region: ' + shape.name + '</b><br />' +
                'Clicked Location: <br />' + Math.round(point.x,1) + ', ' + point.y
                + ', ' + Math.round(point.z,1)
                + '<br />';
                infowindow.setContent(contentString);
                infowindow.setPosition(event.latLng);
                infowindow.open(overviewer.map);
                overviewer.collections.infoWindow = infowindow;
                });
    },
    /**
     * Same as createRegionInfoWindow()
     * 
     * @param google.maps.Marker marker
     */
    'createMarkerInfoWindow': function(marker) {
        var windowContent = '<div class="infoWindow"><img src="' + marker.icon +
            '"/><p>' + marker.title.replace(/\n/g,'<br/>') + '</p></div>';
        var infowindow = new google.maps.InfoWindow({
                'content': windowContent
                });
        google.maps.event.addListener(marker, 'click', function() {
                if (overviewer.collections.infoWindow) {
                overviewer.collections.infoWindow.close();
                }
                infowindow.open(overviewer.map, marker);
                overviewer.collections.infoWindow = infowindow;
                });
    },
    'initHash': function() {
        if(window.location.hash.split("/").length > 1) {
            overviewer.util.goToHash();
            // Clean up the hash.
            overviewer.util.updateHash();

        }
    },
    'setHash': function(x, y, z, zoom, w, maptype)    {
        // save this info is a nice easy to parse format
        var currentWorldView = overviewer.mapModel.get("currentWorldView");
        currentWorldView.options.lastViewport = [x,y,z,zoom];
        window.location.replace("#/" + Math.floor(x) + "/" + Math.floor(y) + "/" + Math.floor(z) + "/" + zoom + "/" + w + "/" + maptype);
    },
    'updateHash': function() {
        var currTileset = overviewer.mapView.options.currentTileSet;
        if (currTileset == null) {return;}
        var coordinates = overviewer.util.fromLatLngToWorld(overviewer.map.getCenter().lat(), 
                overviewer.map.getCenter().lng(),
                currTileset);
        var zoom = overviewer.map.getZoom();
        var maptype = overviewer.map.getMapTypeId();

        // convert mapType into a index
        var currentWorldView = overviewer.mapModel.get("currentWorldView");
        var maptypeId = -1;
        for (id in currentWorldView.options.mapTypeIds) {
            if (currentWorldView.options.mapTypeIds[id] == maptype) {
                maptypeId = id;
            }
        }

        var worldId = -1;
        for (id in overviewer.collections.worldViews) {
            if (overviewer.collections.worldViews[id] == currentWorldView) {
                worldId = id;
            }
        }


        if (zoom == currTileset.get('maxZoom')) {
            zoom = 'max';
        } else if (zoom == currTileset.get('minZoom')) {
            zoom = 'min';
        } else {
            // default to (map-update friendly) negative zooms
            zoom -= currTileset.get('maxZoom');
        }
        overviewer.util.setHash(coordinates.x, coordinates.y, coordinates.z, zoom, worldId, maptypeId);
    },
    'goToHash': function() {
        // Note: the actual data begins at coords[1], coords[0] is empty.
        var coords = window.location.hash.split("/");


        var zoom;
        var worldid = -1;
        var maptyped = -1;
        // The if-statements try to prevent unexpected behaviour when using incomplete hashes, e.g. older links
        if (coords.length > 4) {
            zoom = coords[4];
        }
        if (coords.length > 6) {
            worldid = coords[5];
            maptypeid = coords[6];
        }
        var worldView = overviewer.collections.worldViews[worldid];
        overviewer.mapModel.set({currentWorldView: worldView});

        var maptype = worldView.options.mapTypeIds[maptypeid];
        overviewer.map.setMapTypeId(maptype);
        var tsetModel = worldView.model.get("tileSets").at(maptypeid);
        
        var latlngcoords = overviewer.util.fromWorldToLatLng(parseInt(coords[1]), 
                parseInt(coords[2]), 
                parseInt(coords[3]),
                tsetModel);

        if (zoom == 'max') {
            zoom = tsetModel.get('maxZoom');
        } else if (zoom == 'min') {
            zoom = tsetModel.get('minZoom');
        } else {
            zoom = parseInt(zoom);
            if (zoom < 0 && zoom + tsetModel.get('maxZoom') >= 0) {
                // if zoom is negative, treat it as a "zoom out from max"
                zoom += tsetModel.get('maxZoom');
            } else {
                // fall back to default zoom
                zoom = tsetModel.get('defaultZoom');
            }
        }

        overviewer.map.setCenter(latlngcoords);
        overviewer.map.setZoom(zoom);
    }
};
overviewer.views= {}


overviewer.views.WorldView = Backbone.View.extend({
    initialize: function(opts) {
        this.options.mapTypes = [];
        this.options.mapTypeIds = [];
        this.model.get("tileSets").each(function(tset, index, list) {
            var ops = {
                getTileUrl: overviewer.gmap.getTileUrlGenerator(tset.get("path"), tset.get("base"), tset.get("imgextension")),
                'tileSize':     new google.maps.Size(
                                    overviewerConfig.CONST.tileSize,
                                    overviewerConfig.CONST.tileSize),
                'maxZoom':      tset.get("maxZoom"),
                'minZoom':      tset.get("minZoom"),
                'isPng':        (tset.get("imgextension")=="png")
            };
            var newMapType = new google.maps.ImageMapType(ops);
            newMapType.name = tset.get("name");
            newMapType.shortname = tset.get("name");
            newMapType.alt = "Minecraft " + tset.get("name") + " Map";
            newMapType.projection = new overviewer.classes.MapProjection();
    
            this.options.mapTypes.push(newMapType);
            this.options.mapTypeIds.push(overviewerConfig.CONST.mapDivId + this.model.get("name") + tset.get("name"));

        }, this);
    },
});



overviewer.views.WorldSelectorView = Backbone.View.extend({
    initialize: function() {
        if(overviewer.collections.worldViews.length > 1) {
            // a div will have already been created for us, we just
            // need to register it with the google maps control
            var selectBox = document.createElement('select');
            $.each(overviewer.collections.worldViews, function(index, elem) {
                var o = document.createElement("option");
                o.value = elem.model.get("name");
                o.innerHTML = elem.model.get("name");
                $(o).data("viewObj", elem);
                selectBox.appendChild(o);

            });

            this.el.appendChild(selectBox);
            overviewer.map.controls[google.maps.ControlPosition.TOP_LEFT].push(this.el);
        }
    },
    events: {
        "change select":  "changeWorld"
    },
    changeWorld: function() {
        var selectObj = this.$("select")[0];
        var selectedOption = selectObj.options[selectObj.selectedIndex]; 

        overviewer.mapModel.set({currentWorldView: $(selectedOption).data("viewObj")});
        //
     },
    render: function(t) {
        //console.log("WorldSelectorView::render() TODO implement this (low priority)");
    }
});



overviewer.views.CompassView = Backbone.View.extend({
    initialize: function() {
        this.el.index=0;
        var compassImg = document.createElement('IMG');
        compassImg.src = overviewerConfig.CONST.image.compass;
        this.el.appendChild(compassImg);

        overviewer.map.controls[google.maps.ControlPosition.TOP_RIGHT].push(this.el);
    },
    /**
     * CompassView::render
     */
    render: function() {
        var tsetModel = overviewer.mapView.options.currentTileSet;
        var northdir = tsetModel.get("north_direction");
        if (northdir == overviewerConfig.CONST.UPPERLEFT)
            this.$("IMG").attr("src","compass_upper-left.png");
        if (northdir == overviewerConfig.CONST.UPPERRIGHT)
            this.$("IMG").attr("src", "compass_upper-right.png");
        if (northdir == overviewerConfig.CONST.LOWERLEFT)
            this.$("IMG").attr("src", "compass_lower-left.png");
        if (northdir == overviewerConfig.CONST.LOWERRIGHT)
            this.$("IMG").attr("src", "compass_lower-right.png");
    }
});


overviewer.views.CoordboxView = Backbone.View.extend({
    initialize: function() {
        // Coords box
        this.el.id = 'coordsDiv';
        this.el.innerHTML = 'coords here';
        overviewer.map.controls[google.maps.ControlPosition.BOTTOM_LEFT].push(this.el);
    },
    updateCoords: function(latLng) {
        var worldcoords = overviewer.util.fromLatLngToWorld(latLng.lat(), 
        latLng.lng(),
        overviewer.mapView.options.currentTileSet);
        this.el.innerHTML = "Coords: X " + Math.round(worldcoords.x) + ", Z " + Math.round(worldcoords.z);
    }
});



/* GoogleMapView is responsible for dealing with the GoogleMaps API to create the 
 */

overviewer.views.GoogleMapView = Backbone.View.extend({
    initialize: function(opts) {
        this.options.map = null;
        var curWorld = this.model.get("currentWorldView").model;

        var curTset = curWorld.get("tileSets").at(0);

        /*
           var defaultCenter = overviewer.util.fromWorldToLatLng(
           overviewerConfig.map.center[0], 
           overviewerConfig.map.center[1],
           overviewerConfig.map.center[2],
           curTset.get("defaultZoom"));
           */
        var lat = 0.62939453125;// TODO defaultCenter.lat();
        var lng = 0.38525390625; // TODO defaultCenter.lng();
        var mapcenter = new google.maps.LatLng(lat, lng);

        this.options.mapTypes=[];
        this.options.mapTypeIds=[];
        var opts = this.options;

        var mapOptions = {};
    // 
        // init the map with some default options.  use the first tileset in the first world
        this.options.mapOptions = {
            zoom:                   curTset.get("defaultZoom"),
            center:                 mapcenter,
            panControl:             true,
            scaleControl:           false,
            mapTypeControl:         true,
            //mapTypeControlOptions: {
                //mapTypeIds: this.options.mapTypeIds
            //},
            mapTypeId:              '',
            streetViewControl:      false,
            overviewMapControl:     true,
            zoomControl:            true,
            backgroundColor:        curTset.get("bgcolor")
        };

    
        overviewer.map = new google.maps.Map(this.el, this.options.mapOptions);

        // register every ImageMapType with the map
        $.each(overviewer.collections.worldViews, function( index, worldView) {
            $.each(worldView.options.mapTypes, function(i_index, maptype) {
                overviewer.map.mapTypes.set(overviewerConfig.CONST.mapDivId + 
                    worldView.model.get("name") + maptype.shortname , maptype);
            });
        });
        
    },
    /* GoogleMapView::render()
     * Should be called when the current world has changed in GoogleMapModel
     */
    render: function() {
        var view = this.model.get("currentWorldView");
        this.options.mapOptions.mapTypeControlOptions = {
            mapTypeIds: view.options.mapTypeIds};
        this.options.mapOptions.mapTypeId = view.options.mapTypeIds[0];
        overviewer.map.setOptions(this.options.mapOptions);


        return this;
    },
    /**
     * GoogleMapView::updateCurrentTileset()
     * Keeps track of the currently visible tileset
     */
    updateCurrentTileset: function() {
        var currentWorldView = this.model.get("currentWorldView");
        var gmapCurrent = overviewer.map.getMapTypeId();
        for (id in currentWorldView.options.mapTypeIds) {
            if (currentWorldView.options.mapTypeIds[id] == gmapCurrent) {
                this.options.currentTileSet = currentWorldView.model.get("tileSets").at(id);
            }
        }

        // for this world, remember our current viewport (as worldcoords, not LatLng)
        //

    }

});




/**
 * SignControlView
 */
overviewer.views.SignControlView = Backbone.View.extend({
    /** SignControlView::initialize
     */
    initialize: function(opts) {
        $(this.el).addClass("customControl");
        overviewer.map.controls[google.maps.ControlPosition.TOP_RIGHT].push(this.el);

    },
    registerEvents: function(me) {
        google.maps.event.addListener(overviewer.map, 'maptypeid_changed', function(event) {
            overviewer.mapView.updateCurrentTileset();

            // workaround IE issue.  bah!
            if (typeof markers=="undefined") { return; }
            me.render();
            // hide markers, if necessary
            // for each markerSet, check:
            //    if the markerSet isnot part of this tileset, hide all of the markers
            var curMarkerSet = overviewer.mapView.options.currentTileSet.attributes.path;
            var dataRoot = markers[curMarkerSet];
            if (!dataRoot) { 
                // this tileset has no signs, so hide all of them
                for (markerSet in markersDB) {
                    if (markersDB[markerSet].created) {
                        jQuery.each(markersDB[markerSet].raw, function(i, elem) {
                            elem.markerObj.setVisible(false);
                        });
                    }
                }

                return; 
            }
            var groupsForThisTileSet = jQuery.map(dataRoot, function(elem, i) { return elem.groupName;})
            for (markerSet in markersDB) {
                if (jQuery.inArray(markerSet, groupsForThisTileSet) == -1){
                    // hide these
                    if (markersDB[markerSet].created) {
                        jQuery.each(markersDB[markerSet].raw, function(i, elem) {
                            elem.markerObj.setVisible(false);
                        });
                    }
                    markersDB[markerSet].checked=false;
                }
                // make sure the checkboxes checked if necessary
                $("[_mc_groupname=" + markerSet + "]").attr("checked", markersDB[markerSet].checked);

            }

        });

    },
    /**
     * SignControlView::render
     */
    render: function() {

        var curMarkerSet = overviewer.mapView.options.currentTileSet.attributes.path;
        //var dataRoot = overviewer.collections.markerInfo[curMarkerSet];
        var dataRoot = markers[curMarkerSet];

        this.el.innerHTML=""
        
        // if we have no markerSets for this tileset, do nothing:
        if (!dataRoot) { return; }


        var controlText = document.createElement('DIV');
        controlText.innerHTML = "Signs";

        var controlBorder = document.createElement('DIV');
        $(controlBorder).addClass('top');
        this.el.appendChild(controlBorder);
        controlBorder.appendChild(controlText);

        var dropdownDiv = document.createElement('DIV');
        $(dropdownDiv).addClass('dropDown');
        this.el.appendChild(dropdownDiv);
        dropdownDiv.innerHTML='';

        // add the functionality to toggle visibility of the items
        $(controlText).click(function() {
                $(controlBorder).toggleClass('top-active');
                $(dropdownDiv).toggle();
        });


        // add some menus
        for (i in dataRoot) {
            var group = dataRoot[i];
            this.addItem({label: group.displayName, groupName:group.groupName, action:function(this_item, checked) {
                markersDB[this_item.groupName].checked = checked;
                jQuery.each(markersDB[this_item.groupName].raw, function(i, elem) {
                    elem.markerObj.setVisible(checked);
                });
            }});
        }

        iconURL = overviewerConfig.CONST.image.signMarker;
        //dataRoot['markers'] = [];
        //
        for (i in dataRoot) {
            var groupName = dataRoot[i].groupName;
            if (!markersDB[groupName].created) {
                for (j in markersDB[groupName].raw) {
                    var entity = markersDB[groupName].raw[j];
                    var marker = new google.maps.Marker({
                            'position': overviewer.util.fromWorldToLatLng(entity.x,
                                entity.y, entity.z, overviewer.mapView.options.currentTileSet),
                            'map':      overviewer.map,
                            'title':    jQuery.trim(entity.Text1 + "\n" + entity.Text2 + "\n" + entity.Text3 + "\n" + entity.Text4), 
                            'icon':     iconURL,
                            'visible':  false
                    }); 
                    if (entity['id'] == 'Sign') {
                        overviewer.util.createMarkerInfoWindow(marker);
                    }
                    jQuery.extend(entity, {markerObj: marker});
                }
                markersDB[groupName].created = true;
            }
        }


    },
    addItem: function(item) {
        var itemDiv = document.createElement('div');
        var itemInput = document.createElement('input');
        itemInput.type='checkbox';

        // give it a name
        $(itemInput).data('label',item.label);
        $(itemInput).attr("_mc_groupname", item.groupName);
        jQuery(itemInput).click((function(local_item) {
            return function(e) {
                item.action(local_item, e.target.checked);
            };
        })(item));

        this.$(".dropDown")[0].appendChild(itemDiv);
        itemDiv.appendChild(itemInput);
        var textNode = document.createElement('text');
        if(item.icon) {
            textNode.innerHTML = '<img width="15" height="15" src="' + 
                item.icon + '">' + item.label + '<br/>';
        } else {
            textNode.innerHTML = item.label + '<br/>';
        }

        itemDiv.appendChild(textNode);


    },
});

/**
 * SpawnIconView
 */
overviewer.views.SpawnIconView = Backbone.View.extend({
    render: function() {
        // 
        var curTileSet = overviewer.mapView.options.currentTileSet;
        if (overviewer.collections.spawnMarker) {
            overviewer.collections.spawnMarker.setMap(null);
            overviewer.collections.spawnMarker = null;
        }
        var spawn = curTileSet.get("spawn");
        if (spawn) {
            overviewer.collections.spawnMarker = new google.maps.Marker({
                'position': overviewer.util.fromWorldToLatLng(spawn[0],
                    spawn[1], spawn[2], overviewer.mapView.options.currentTileSet),
                'map':      overviewer.map,
                'title':    'spawn',
                'icon':     overviewerConfig.CONST.image.spawnMarker,
                'visible':  false
                }); 
            overviewer.collections.spawnMarker.setVisible(true);
        }
    }
});

