
define(function (require) {

    var SymbolDraw = require('../helper/SymbolDraw');
    var LineDraw = require('../helper/LineDraw');
    var RoamController = require('../../component/helper/RoamController');

    var graphic = require('../../util/graphic');
    var adjustEdge = require('./adjustEdge');
    var zrUtil = require('zrender/core/util');

    var nodeOpacityPath = ['itemStyle', 'normal', 'opacity'];
    var lineOpacityPath = ['lineStyle', 'normal', 'opacity'];
    
    var Echarts = require('../../echarts');
    var clickGroup = false;
    var onClickDom = null;

    function getItemOpacity(item, opacityPath) {
        return item.getVisual('opacity') || item.getModel().get(opacityPath);
    }
    
    

    Echarts.extendChartView({

        type: 'graph',
        
        _onClickDom:null,

        init: function (ecModel, api) {
            var symbolDraw = new SymbolDraw();
            var lineDraw = new LineDraw();
            var group = this.group;
            var controller = new RoamController(api.getZr(), group);

            group.add(symbolDraw.group);
            group.add(lineDraw.group);
            
            if(!onClickDom){
                onClickDom = function(){
                  if(clickGroup){
                      clickGroup = false;
                  }else{
                      this._unfocusAll();
                      this._selectNodeId = -1;
                  }
                }.bind(this)
            }
            
            api.getDom().addEventListener('click',onClickDom);
            
            group.on('click',function(){
              clickGroup = true;
            })

            this._symbolDraw = symbolDraw;
            this._lineDraw = lineDraw;
            this._controller = controller;
            this._selectNode = null;
            this._firstRender = true;
        },

        render: function (seriesModel, ecModel, api) {
            var coordSys = seriesModel.coordinateSystem;

            this._model = seriesModel;
            this._nodeScaleRatio = seriesModel.get('nodeScaleRatio');

            var symbolDraw = this._symbolDraw;
            var lineDraw = this._lineDraw;

            var group = this.group;

            if (coordSys.type === 'view') {
                var groupNewProp = {
                    position: coordSys.position,
                    scale: coordSys.scale
                };
                if (this._firstRender) {
                    group.attr(groupNewProp);
                }
                else {
                    graphic.updateProps(group, groupNewProp, seriesModel);
                }
            }
            // Fix edge contact point with node
            adjustEdge(seriesModel.getGraph(), this._getNodeGlobalScale(seriesModel));

            var data = seriesModel.getData();
            symbolDraw.updateData(data);

            var edgeData = seriesModel.getEdgeData();
            
            lineDraw.updateData(edgeData);

            this._updateNodeAndLinkScale();

            this._updateController(seriesModel, api);

            clearTimeout(this._layoutTimeout);
            var forceLayout = seriesModel.forceLayout;
            var layoutAnimation = seriesModel.get('force.layoutAnimation');
            if (forceLayout) {
                this._startForceLayoutIteration(forceLayout, layoutAnimation);
            }
            data.eachItemGraphicEl(function (el, idx) {
                var itemModel = data.getItemModel(idx);
                // Update draggable
                el.off('drag').off('dragend');
                var draggable = data.getItemModel(idx).get('draggable');
                if (draggable) {
                    el.on('drag', function () {
                        if (forceLayout) {
                            forceLayout.warmUp();
                            !this._layouting
                                && this._startForceLayoutIteration(forceLayout, layoutAnimation);
                            forceLayout.setFixed(idx);
                            // Write position back to layout
                            data.setItemLayout(idx, el.position);
                        }
                    }, this).on('dragend', function () {
                        if (forceLayout) {
                            forceLayout.setUnfixed(idx);
                        }
                    }, this);
                }
                el.setDraggable(draggable && forceLayout);

                el.off('mouseover', this._focusNodeAdjacency);
                el.off('mouseout', this._unfocusAll);
                if (itemModel.get('focusNodeAdjacency')) {
                    el.on('mouseover', this._focusNodeAdjacency, this);
                    el.on('mouseout', this._unfocusAll, this);
                }
                if(itemModel.get('focusNodeAdjacencyByClick')){
                    el.on('click',this._focusNodeAdjacency, this);
                }
                
            }, this);

            var circularRotateLabel = seriesModel.get('layout') === 'circular' && seriesModel.get('circular.rotateLabel');
            var cx = data.getLayout('cx');
            var cy = data.getLayout('cy');
            data.eachItemGraphicEl(function (el, idx) {
                var symbolPath = el.getSymbolPath();
                if (circularRotateLabel) {
                    var pos = data.getItemLayout(idx);
                    var rad = Math.atan2(pos[1] - cy, pos[0] - cx);
                    if (rad < 0) {
                        rad = Math.PI * 2 + rad;
                    }
                    var isLeft = pos[0] < cx;
                    if (isLeft) {
                        rad = rad - Math.PI;
                    }
                    var textPosition = isLeft ? 'left' : 'right';
                    symbolPath.setStyle({
                        textRotation: rad,
                        textPosition: textPosition
                    });
                    symbolPath.hoverStyle && (symbolPath.hoverStyle.textPosition = textPosition);
                }
                else {
                    symbolPath.setStyle({
                        textRotation: 0
                    });
                }
            });

            this._firstRender = false;
        },

        _focusNodeAdjacency: function (e) {
            var data = this._model.getData();
            var graph = data.graph;
            var el = e.target;
            var dataIndex = el.dataIndex;
            var dataType = el.dataType;

            function fadeOutItem(item, opacityPath) {
                var opacity = getItemOpacity(item, opacityPath);
                var el = item.getGraphicEl();
                if (opacity == null) {
                    opacity = 1;
                }

                el.traverse(function (child) {
                    child.trigger('normal');
                    if (child.type !== 'group') {
                        child.setStyle('opacity', opacity * 0.1);
                        child.silent=true;
                    }
                });
            }

            function fadeInItem(item, opacityPath) {
                var opacity = getItemOpacity(item, opacityPath);
                var el = item.getGraphicEl();

                el.traverse(function (child) {
                    child.trigger('emphasis');
                    if (child.type !== 'group') {
                        child.setStyle('opacity', opacity);
                        child.silent=false;
                    }
                });
            }
            
            if (dataIndex !== null && dataType !== 'edge') {
                
                var node = graph.getNodeByIndex(dataIndex);
                if(this._selectNodeId == dataIndex){
                    this._unfocusAll();
                    this._selectNodeId = -1;
                    return;
                }
                
                this._selectNodeId = dataIndex;
                
                graph.eachNode(function (node) {
                    fadeOutItem(node, nodeOpacityPath);
                });
                graph.eachEdge(function (edge) {
                    fadeOutItem(edge, lineOpacityPath);
                });

                fadeInItem(node, nodeOpacityPath);
                zrUtil.each(node.edges, function (edge) {
                    if (edge.dataIndex < 0) {
                        return;
                    }
                    fadeInItem(edge, lineOpacityPath);
                    fadeInItem(edge.node1, nodeOpacityPath);
                    fadeInItem(edge.node2, nodeOpacityPath);
                });
                
                
            }
        },

        _unfocusAll: function () {
            var data = this._model.getData();
            var graph = data.graph;
            graph.eachNode(function (node) {
                var opacity = getItemOpacity(node, nodeOpacityPath);
                node.getGraphicEl().traverse(function (child) {
                    child.trigger('normal');
                    if (child.type !== 'group') {
                        child.setStyle('opacity', opacity);
                        child.silent=false;
                    }
                });
            });
            graph.eachEdge(function (edge) {
                var opacity = getItemOpacity(edge, lineOpacityPath);
                edge.getGraphicEl().traverse(function (child) {
                    child.trigger('normal');
                    if (child.type !== 'group') {
                        child.setStyle('opacity', opacity);
                        child.silent=false;
                    }
                });
            });
        },

        _startForceLayoutIteration: function (forceLayout, layoutAnimation) {
            var self = this;
            (function step() {
                forceLayout.step(function (stopped) {
                    self.updateLayout(self._model);
                    (self._layouting = !stopped) && (
                        layoutAnimation
                            ? (self._layoutTimeout = setTimeout(step, 16))
                            : step()
                    );
                });
            })();
        },

         
        
        _updateController: function (seriesModel, api) {
            var controller = this._controller;
            var group = this.group;
            controller.rectProvider = function () {
                var rect = group.getBoundingRect();
                rect.applyTransform(group.transform);
                return rect;
            };
            if (seriesModel.coordinateSystem.type !== 'view') {
                controller.disable();
                return;
            }
            controller.enable(seriesModel.get('roam'));
            controller.zoomLimit = seriesModel.get('scaleLimit');
            // Update zoom from model
            controller.zoom = seriesModel.coordinateSystem.getZoom();

            controller
                .off('pan')
                .off('zoom')
                .on('pan', function (dx, dy) {
                    api.dispatchAction({
                        seriesId: seriesModel.id,
                        type: 'graphRoam',
                        dx: dx,
                        dy: dy
                    });
                })
                .on('zoom', function (zoom, mouseX, mouseY) {
                    api.dispatchAction({
                        seriesId: seriesModel.id,
                        type: 'graphRoam',
                        zoom:  zoom,
                        originX: mouseX,
                        originY: mouseY
                    });
                    this._updateNodeAndLinkScale();
                    adjustEdge(seriesModel.getGraph(), this._getNodeGlobalScale(seriesModel));
                    this._lineDraw.updateLayout();
                }, this);
        },

        _updateNodeAndLinkScale: function () {
            var seriesModel = this._model;
            var data = seriesModel.getData();

            var nodeScale = this._getNodeGlobalScale(seriesModel);
            var invScale = [nodeScale, nodeScale];

            data.eachItemGraphicEl(function (el, idx) {
                el.attr('scale', invScale);
            });
        },

        _getNodeGlobalScale: function (seriesModel) {
            var coordSys = seriesModel.coordinateSystem;
            if (coordSys.type !== 'view') {
                return 1;
            }

            var nodeScaleRatio = this._nodeScaleRatio;

            var groupScale = coordSys.scale;
            var groupZoom = (groupScale && groupScale[0]) || 1;
            // Scale node when zoom changes
            var roamZoom = coordSys.getZoom();
            var nodeScale = (roamZoom - 1) * nodeScaleRatio + 1;

            return nodeScale / groupZoom;
        },

        updateLayout: function (seriesModel) {
            adjustEdge(seriesModel.getGraph(), this._getNodeGlobalScale(seriesModel));

            this._symbolDraw.updateLayout();
            this._lineDraw.updateLayout();
        },

        remove: function (ecModel, api) {
            this._symbolDraw && this._symbolDraw.remove();
            this._lineDraw && this._lineDraw.remove();
            api.getDom().removeEventListener('click',onClickDom);
            
        }
    });
});