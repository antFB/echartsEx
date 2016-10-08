define(function (require) {

    var vec2 = require('zrender/core/vector');
    var jiggle = require('./jiggle')
    var quadTree = require('echarts/util/quadTree/quadTree')
    var scaleAndAdd = vec2.scaleAndAdd;

    // function adjacentNode(n, e) {
    //     return e.n1 === n ? e.n2 : e.n1;
    // }

    function normalMode(nodes, friction) {
        var nLen = nodes.length,v12=[];
        for (var i = 0; i < nLen; i++) {
            var n1 = nodes[i];
            for (var j = i + 1; j < nLen; j++) {
                var n2 = nodes[j];
                vec2.sub(v12, n2.p, n1.p);
                var d = vec2.len(v12);
                if (d === 0) {
                    // Random repulse
                    vec2.set(v12, Math.random() - 0.5, Math.random() - 0.5);
                    d = 1;
                }
                var repFact = (n1.rep + n2.rep) / d / d;
                !n1.fixed && scaleAndAdd(n1.pp, n1.pp, v12, repFact);
                !n2.fixed && scaleAndAdd(n2.pp, n2.pp, v12, -repFact);
            }
        }
        var v = [];
        for (var i = 0; i < nLen; i++) {
            var n = nodes[i];
            if (!n.fixed) {
                vec2.sub(v, n.p, n.pp);
                vec2.scaleAndAdd(n.p, n.p, v, friction);
                vec2.copy(n.pp, n.p);
            }
        }
    }

    function barnesMode(nodes,friction,distanceMax,distanceMin){
        var nLen=nodes.length
        var tree = quadTree(nodes, function (d) {
            return d.p[0]
        }, function (d) {
            return d.p[1]
        })
            .visitAfter(function (quad) {
                var strength = 0, q, c, x, y, i;
                // For internal nodes, accumulate forces from child quadrants.
                if (quad.length) {
                    for (x = y = i = 0; i < 4; ++i) {
                        if ((q = quad[i]) && (c = q.value)) {
                            strength += c, x += c * q.x, y += c * q.y;
                        }
                    }
                    quad.x = x / strength;
                    quad.y = y / strength;
                }

                // For leaf nodes, accumulate forces from coincident quadrants.
                else {
                    q = quad;
                    q.x = q.data.p[0];
                    q.y = q.data.p[1];
                    do strength += q.data.rep;
                    while (q = q.next);
                }
                quad.vector = [quad.x, quad.y];
                quad.value = strength;
            });
        for (var i = 0; i < nLen; i++) {
            var node = nodes[i], v = [];
            tree.visit(function (quad, x0, y0, x1) {
                if (!quad.value) return true;
                vec2.sub(v, quad.vector, node.p);
                var w = x1 - x0, l = vec2.len(v);
                if (w * w / 0.81 < l * l) {
                    if (l * l < distanceMax) {
                        if (v[0] === 0) v[0] = jiggle();
                        if (v[1] === 0) v[1] = jiggle();
                        l = vec2.len(v);
                        if (l < distanceMin) l = Math.sqrt(distanceMin * l);
                        var repFact = (node.rep + quad.value) / l / l;
                        !node.fixed && scaleAndAdd(node.pp, node.pp, v, repFact);
                    }
                    return true
                }
                else if (quad.length || l >= distanceMax) return;

                if (quad.data !== node || quad.next) {
                    if (v[0] === 0) v[0] = jiggle();
                    if (v[1] === 0) v[1] = jiggle();
                    l = vec2.len(v);
                    if (l < distanceMin) l = Math.sqrt(distanceMin * l);
                }

                do if (quad.data !== node) {
                    vec2.sub(v, quad.data.p, node.p)
                    var repFact = (node.rep + quad.data.rep) / l / l;
                    !node.fixed && scaleAndAdd(node.pp, node.pp, v, repFact);
                } while (quad = quad.next);
            })
        }
        for (var i = 0; i < nLen; i++) {
            var n = nodes[i], v = [];
            if (!n.fixed) {
                vec2.sub(v, n.p, n.pp);
                vec2.scaleAndAdd(n.p, n.p, v, friction);
                vec2.copy(n.pp, n.p);
            }
        }
    }

    return function (nodes, edges, opts) {
        var rect = opts.rect;
        var width = rect.width;
        var height = rect.height;
        var center = [rect.x + width / 2, rect.y + height / 2];
        // var scale = opts.scale || 1;
        var gravity = opts.gravity == null ? 0.1 : opts.gravity;
        var distanceMax = opts.distanceMax == null ? Infinity : opts.distanceMax;
        var distanceMin = opts.distanceMin == null || opts.distanceMin < 1 ? 1 : opts.distanceMin;
        var optimize=opts.optimize==null?"normal":opts.optimize

        // for (var i = 0; i < edges.length; i++) {
        //     var e = edges[i];
        //     var n1 = e.n1;
        //     var n2 = e.n2;
        //     n1.edges = n1.edges || [];
        //     n2.edges = n2.edges || [];
        //     n1.edges.push(e);
        //     n2.edges.push(e);
        // }
        // Init position
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (!n.p) {
                // Use the position from first adjecent node with defined position
                // Or use a random position
                // From d3
                // if (n.edges) {
                //     var j = -1;
                //     while (++j < n.edges.length) {
                //         var e = n.edges[j];
                //         var other = adjacentNode(n, e);
                //         if (other.p) {
                //             n.p = vec2.clone(other.p);
                //             break;
                //         }
                //     }
                // }
                // if (!n.p) {
                n.p = vec2.create(
                    width * (Math.random() - 0.5) + center[0],
                    height * (Math.random() - 0.5) + center[1]
                );
                // }
            }
            n.pp = vec2.clone(n.p);
            n.edges = null;
        }

        // Formula in 'Graph Drawing by Force-directed Placement'
        // var k = scale * Math.sqrt(width * height / nodes.length);
        // var k2 = k * k;

        var friction = 0.6;

        return {
            warmUp: function () {
                friction = 0.5;
            },

            setFixed: function (idx) {
                nodes[idx].fixed = true;
            },

            setUnfixed: function (idx) {
                nodes[idx].fixed = false;
            },

            step: function (cb) {
                var v12 = [];
                var nLen = nodes.length;
                for (var i = 0; i < edges.length; i++) {
                    var e = edges[i];
                    var n1 = e.n1;
                    var n2 = e.n2;

                    vec2.sub(v12, n2.p, n1.p);
                    var d = (vec2.len(v12) - e.d);
                    var w = n2.w / (n1.w + n2.w);
                    vec2.normalize(v12, v12);

                    !n1.fixed && scaleAndAdd(n1.p, n1.p, v12, w * d * friction);
                    !n2.fixed && scaleAndAdd(n2.p, n2.p, v12, -(1 - w) * d * friction);
                }
                // Gravity
                for (var i = 0; i < nLen; i++) {
                    var n = nodes[i];
                    if (!n.fixed) {
                        vec2.sub(v12, center, n.p);
                        // var d = vec2.len(v12);
                        // vec2.scale(v12, v12, 1 / d);
                        // var gravityFactor = gravity;
                        vec2.scaleAndAdd(n.p, n.p, v12, gravity * friction);
                    }
                }

                // Repulsive
                // PENDING
                switch(optimize){
                    case 'normal':normalMode(nodes,friction);break;
                    case 'Barnes-Hut':barnesMode(nodes,friction,distanceMax,distanceMin);break;
                    default:normalMode(nodes,friction);
                }


                friction = friction * 0.992;

                cb && cb(nodes, edges, friction < 0.01);
            }
        };
    };
});
