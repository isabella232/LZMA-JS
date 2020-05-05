//! © 2015 Nathan Rugg <nmrugg@gmail.com> | MIT
/// See LICENSE for more details.

/// Let's use Web Workers.
///NOTE: The "this" keyword is the global context ("window" variable) if loaded via a <script> tag
///      or the function context if loaded as a module (e.g., in Node.js).


// Base on `https://webpack.js.org/configuration/output/`
(function umdDefinition(factory) {
    
    // CFH - in case we want to expose this globally later on
    const root = (typeof globalThis !== "undefined") ? globalThis :
        (typeof window !== "undefined") ? window :
        (typeof global !== "undefined") ? global :
        null;
    
    if (typeof exports === 'object' && typeof module === 'object')
        module.exports = factory();
    else if (typeof exports === 'object')
        exports['LZMA'] = factory();
    else
        root['LZMA'] = factory();
})(function () {
    
    const LZMA = function (lzma_path) {
        var action_compress   = 1,
            action_decompress = 2,
            action_progress   = 3,
            
            callback_obj = {},
            
            ///NOTE: Node.js needs something like "./" or "../" at the beginning.
            lzma_worker = new Worker(lzma_path || "./lzma_worker-min.js");
        
        lzma_worker.onmessage = function (e) {
            if (e.data.action === action_progress) {
                if (callback_obj[e.data.callback_num] && typeof callback_obj[e.data.callback_num].on_progress === "function") {
                    callback_obj[e.data.callback_num].on_progress(e.data.result);
                }
            } else {
                if (callback_obj[e.data.callback_num] && typeof callback_obj[e.data.callback_num].on_finish === "function") {
                    callback_obj[e.data.callback_num].on_finish(e.data.result);
                    
                    /// Since the (de)compression is complete, the callbacks are no longer needed.
                    delete callback_obj[e.data.callback_num];
                }
            }
        };
        
        /// Very simple error handling.
        lzma_worker.onerror = function(event) {
            throw new Error(event.message + " (" + event.filename + ":" + event.lineno + ")");
        };
        
        return (function () {
            
            function send_to_worker(action, data, mode, on_finish, on_progress) {
                var callback_num;
                
                do {
                    callback_num = Math.floor(Math.random() * (10000000));
                } while(typeof callback_obj[callback_num] !== "undefined");
                
                callback_obj[callback_num] = {
                    on_finish:   on_finish,
                    on_progress: on_progress
                };
                
                lzma_worker.postMessage({
                    action:       action,
                    callback_num: callback_num,
                    data:         data,
                    mode:         mode
                });
            }
            
            return {
                compress: function compress(string, mode, on_finish, on_progress) {
                    send_to_worker(action_compress, String(string), mode, on_finish, on_progress);
                },
                decompress: function decompress(byte_arr, on_finish, on_progress) {
                    send_to_worker(action_decompress, byte_arr, false, on_finish, on_progress);
                }
            };
        }());
    };
    
    return LZMA;
});


